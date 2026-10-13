/**
 * Animal Buddy 服务端教学工作流（第一阶段：My Pet）。
 *
 * 设计原则（对应「不是简单调用通用聊天模型」）：
 * 1. 对话脚本、轮次推进、答案判定、纠错策略全部由本服务端工作流掌控；
 *    模型（豆包）只负责把工作流给出的教学意图，润色成适合三年级、可 TTS 的一句英文。
 * 2. 是否正确 / 用哪个教材句型 / 是否给示范，均由结构化教材数据做确定性判定，
 *    模型不能改分、不能跳题、不能引入教材外内容。
 * 3. 会话状态在服务端按 uid+scene 隔离（内存态，开发期足够；后续可落库）。
 */
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';
import type { Request } from 'express';
import {
  SCENES,
  type DialogueTurn,
  type SceneScript,
} from './curriculum';
import { buildSystemPrompt } from './prompt';

export type Verdict = 'correct' | 'incomplete' | 'incorrect';
export type SourceKind = 'textbook' | 'adapted';

/** 结构化错误分类（用于精准反馈与学习记录） */
export type ErrorType =
  | 'grammar' // 语法错误（如 I has）
  | 'word' // 词汇不在教材集合内 / 用词不当
  | 'mismatch' // 内容与当前问题不匹配（答非所问）
  | 'incomplete' // 说得不完整，能理解但需补全
  | 'asr_empty' // ASR 空结果 / 未识别到有效语音（不算知识错误）
  | 'asr_low_conf' // ASR 低置信度结果（不算知识错误，需复核）
  | 'none';

export interface TutorFeedback {
  /** 给孩子听/看的一句英文回复（由模型基于教学意图生成） */
  reply: string;
  /** 中文提示（纠错/解释），可为空 */
  replyZh: string;
  /** 本轮判定 */
  verdict: Verdict;
  /** 这是第几轮学生回答（1 起） */
  round: number;
  /** 本轮 Rex 提出的问题 */
  question: string;
  /** 学生本轮是否用到了教材原句 */
  sourceKind: SourceKind;
  /** 引用教材页码 */
  page: number;
  /** 命中的教材目标句型（若有） */
  matchedPattern?: string;
  /** 纠错信息（仅在非 correct 时给出） */
  correction?: {
    /** 一处具体问题（中文） */
    issue: string;
    /** 教材句型示范 */
    modelAnswer: string;
    /** 这是该题第几次没答对（1=给提示让自纠，2=给示范跟读） */
    attempt: number;
  };
  /** 是否完成脚本全部轮次 */
  finished: boolean;
  /** 下一步教学动作（工作流内部意图，便于前端/记录使用） */
  action: 'advance' | 'retry_hint' | 'retry_model' | 'finish';
  /** 结构化错误分类（用于学习记录/反馈；correct 时为 'none'） */
  errorType: ErrorType;
  /** ASR 置信度提示（低置信度/空结果时非空，说明不算知识错误） */
  asrNote?: string;
  engine: 'builtin-doubao-workflow';
}

interface SessionState {
  scene: string;
  /** 下一轮要问的序号（指向 turns[roundIndex]） */
  roundIndex: number;
  /** 当前这道题连续未答对次数 */
  missStreak: number;
  /** 已完成轮次数 */
  answered: number;
  createdAt: number;
  updatedAt: number;
}

const sessions = new Map<string, SessionState>();

function sessionKey(uid: string, scene: string): string {
  return `${uid}::${scene}`;
}

/** 规范化学生英文：去标点、压缩空格、转小写、规整 do not/dont */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:"'’`]/g, ' ')
    .replace(/\bdont\b/g, 'do not')
    .replace(/\bdidnt\b/g, 'did not')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 判断学生回答是否命中某一目标/可接受句型（包含式匹配，容忍前缀称呼语） */
function matches(normalized: string, patterns: string[]): string | undefined {
  for (const raw of patterns) {
    const p = normalize(raw);
    if (!p) continue;
    // 单词边界包含匹配，避免 "doggy" 误命中 "dog"
    const re = new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    if (normalized === p || re.test(normalized)) return p;
  }
  return undefined;
}

interface Evaluation {
  verdict: Verdict;
  matched?: string;
  sourceKind: SourceKind;
  issue?: string;
  errorType: ErrorType;
}

function evaluateAnswer(raw: string, turn: DialogueTurn): Evaluation {
  const n = normalize(raw);
  if (!n) return { verdict: 'incomplete', sourceKind: 'adapted', errorType: 'asr_empty' };

  // 优先级最高：硬性语法错误（如 I has ...），即使句子里含正确词汇也必须先拦下纠错。
  const hardIssue = detectHardGrammarError(n);
  if (hardIssue) {
    return { verdict: 'incorrect', sourceKind: 'adapted', issue: hardIssue, errorType: 'grammar' };
  }

  const textbookHit = matches(n, turn.expectedPatterns);
  if (textbookHit) {
    return { verdict: 'correct', matched: textbookHit, sourceKind: 'textbook', errorType: 'none' };
  }

  const acceptHit = matches(n, turn.acceptablePatterns);
  if (acceptHit) {
    return { verdict: 'correct', matched: acceptHit, sourceKind: 'adapted', errorType: 'none' };
  }

  // 词汇错误：含教材外的词（其它动物/宠物等），但与本题无关 → 引导回到教材词汇
  const wordIssue = detectForeignWord(n, turn);
  if (wordIssue) {
    return { verdict: 'incomplete', sourceKind: 'adapted', issue: wordIssue, errorType: 'word' };
  }

  // 内容不匹配：学生答了另一个问题（答非所问），但说的本身是英文
  const mismatch = detectMismatch(n, turn);
  if (mismatch) {
    return { verdict: 'incomplete', sourceKind: 'adapted', issue: mismatch, errorType: 'mismatch' };
  }

  // 软性不完整：答案能理解但没说完整句
  const softIssue = detectSoftIncompleteness(n, turn);
  if (softIssue) {
    return { verdict: 'incomplete', sourceKind: 'adapted', issue: softIssue, errorType: 'incomplete' };
  }

  return {
    verdict: 'incomplete',
    sourceKind: 'adapted',
    issue: `这一轮我们练：${turn.focus}。`,
    errorType: 'incomplete',
  };
}

/** 硬性语法错误：三年级明确要纠正的点（第一阶段：I has → I have） */
function detectHardGrammarError(normalized: string): string | null {
  if (/\bi has\b/.test(normalized)) {
    return '说“我有……”的时候，I（我）后面要用 have，不能用 has。';
  }
  return null;
}

/** 词汇错误：出现了教材范围外的动物/宠物词，与本题无关 → 属于词汇用错 */
const ZOO_ANIMAL_VOCAB = new Set(['panda', 'monkey', 'tiger', 'elephant', 'lion', 'pandas', 'monkeys', 'tigers', 'elephants', 'lions']);
const PET_VOCAB = new Set(['dog', 'cat', 'fish', 'bird', 'rabbit', 'dogs', 'cats', 'fish', 'birds', 'rabbits']);

function detectForeignWord(normalized: string, turn: DialogueTurn): string | null {
  // 仅当学生回答中主要词是另一场景的核心动物/宠物，且不在本题目标范围时提示
  const tokens = normalized.split(/\s+/);
  if (turn.page === 32 || turn.page === 33) {
    // Zoo 场景：出现宠物词（dog/cat 等）而非野生动物 → 词汇使用不当
    const petHit = tokens.find(t => PET_VOCAB.has(t));
    if (petHit && !ZOO_ANIMAL_VOCAB.has(tokens.find(t => ZOO_ANIMAL_VOCAB.has(t)) ?? '')) {
      return `这一轮我们在动物园，可以用野生动物词，比如 panda、monkey、tiger，而不是 ${petHit}。`;
    }
    if (turn.round === 1 || turn.round === 2 || turn.round === 4) {
      // 动物识别轮：出现不认识的其它动物词
      const wild = tokens.find(t => /^(fox|red panda|giraffe|bear|zebra|lion tiger)$/.test(t));
      if (wild && !tokens.find(t => ZOO_ANIMAL_VOCAB.has(t))) {
        return `动物园里有这几种动物：panda、monkey、tiger、elephant、lion。可以试一个。`;
      }
    }
  } else if (turn.page === 28 || turn.page === 29) {
    // My Pet 场景：出现野生动物词而非宠物 → 词汇使用不当
    const wild = tokens.find(t => ZOO_ANIMAL_VOCAB.has(t));
    if (wild) {
      return `我们聊的是宠物，可以说 dog、cat、fish、bird、rabbit，而不是 ${wild}。`;
    }
  }
  return null;
}

/** 内容不匹配：答非所问（回答明显属于另一个问题，但本身是英文） */
function detectMismatch(normalized: string, turn: DialogueTurn): string | null {
  if ((turn.round === 1 || turn.round === 2 || turn.round === 4) && /^(i (have|like|am|love|want) |my name|i am \d|how are you)/i.test(normalized)) {
    return '我们问的是动物园里的动物，试着用这句话里的动物词回答，好吗？';
  }
  return null;
}

/** 软性不完整：答案能理解但没说完整句 */
function detectSoftIncompleteness(normalized: string, turn: DialogueTurn): string | null {
  if (turn.round === 1) {
    const onlyWord = matches(normalized, ZOO_ANIMAL_VOCAB instanceof Set ? ['panda', 'monkey', 'tiger', 'elephant', 'lion'] : []);
    if (onlyWord) {
      return '能把单词连成句子吗？试试用 “I see a …” 开头来说。';
    }
  }
  if (turn.round === 2) {
    const onlyWord = matches(normalized, ['panda', 'monkey', 'tiger', 'elephant', 'lion', 'dog', 'cat', 'fish', 'bird', 'rabbit']);
    if (onlyWord) {
      return '试试用 “It’s a …” 把答案说完整，好吗？';
    }
  }
  return null;
}

/** 调豆包，把教学意图生成一句适合三年级、可 TTS 的英文；返回 {reply, replyZh} */
async function generateReply(
  req: Request,
  scene: SceneScript,
  instruction: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ reply: string; replyZh: string }> {
  const client = new LLMClient(
    new Config(),
    HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>),
  );

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: buildSystemPrompt(scene) },
    ...history.slice(-6),
    { role: 'user', content: instruction },
  ];

  const resp = await client.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
    thinking: 'disabled',
    temperature: 0.5,
  });

  return parseModelJson(resp.content);
}

/** 健壮解析模型输出的 JSON（容忍模型偶尔包裹 ```json 或多余文字） */
function parseModelJson(content: string): { reply: string; replyZh: string } {
  const fallback = { reply: 'Good job! Let us keep going.', replyZh: '' };
  if (!content) return fallback;
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    // 模型未按 JSON 返回：把整句作为英文回复，避免流程中断
    return { reply: text.replace(/\s+/g, ' ').slice(0, 160), replyZh: '' };
  }
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { reply?: unknown; replyZh?: unknown };
    const reply = typeof obj.reply === 'string' && obj.reply.trim() ? obj.reply.trim() : fallback.reply;
    const replyZh = typeof obj.replyZh === 'string' ? obj.replyZh.trim() : '';
    return { reply, replyZh };
  } catch {
    return { reply: text.slice(start, end + 1).replace(/\s+/g, ' ').slice(0, 160), replyZh: '' };
  }
}

function startSession(uid: string, sceneKey: string): SessionState {
  const s: SessionState = {
    scene: sceneKey,
    roundIndex: 0,
    missStreak: 0,
    answered: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.set(sessionKey(uid, sceneKey), s);
  return s;
}

export interface RunInput {
  uid: string;
  scene: string;
  text: string;
  reset?: boolean;
  history: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * 主入口：处理学生一轮回答，推进教学工作流。
 */
export async function runTutorTurn(req: Request, input: RunInput): Promise<TutorFeedback> {
  const sceneKey = SCENES[input.scene] ? input.scene : 'my-pet';
  const scene = SCENES[sceneKey];

  if (input.reset) sessions.delete(sessionKey(input.uid, sceneKey));
  let state = sessions.get(sessionKey(input.uid, sceneKey));
  if (!state) state = startSession(input.uid, sceneKey);

  const turn = scene.turns[state.roundIndex] ?? scene.turns[scene.turns.length - 1];
  const evaluation = evaluateAnswer(input.text, turn);

  let instruction: string;
  let action: TutorFeedback['action'];
  let replyZh = '';
  let correction: TutorFeedback['correction'] | undefined;
  let finished = false;

  // ASR 空结果 / 低置信度：绝不当作知识错误，不扣分、不推进，只温和请其重说一遍
  let asrNote: string | undefined;
  if (evaluation.errorType === 'asr_empty' || asrLowConfidence(input.text)) {
    asrNote = '未识别到清晰的有效语音，本次不计入正确或错误。';
    state.updatedAt = Date.now();
    action = 'retry_hint';
    correction = {
      issue: '抱歉，老师没有听清你说的话，请再大声/清楚地说一遍，好吗？',
      modelAnswer: turn.modelAnswer,
      attempt: state.missStreak + 1,
    };
    instruction =
      `孩子这次（可能是语音识别）没有清晰说出答案，疑似没听清/没识别到。` +
      `请用一句非常简短、温和、鼓励的英语让孩子再试一次，` +
      `可以说 "Sorry, I did not hear you. Please say it again." 之类，不要给答案、不要评判、不要追问新内容。`;
    replyZh = '抱歉，我没听清，请再说一遍好吗？（本次不计分）';
  } else if (evaluation.verdict === 'correct') {
    state.missStreak = 0;
    state.answered += 1;
    state.roundIndex += 1;
    state.updatedAt = Date.now();

    const nextTurn = scene.turns[state.roundIndex];
    if (nextTurn) {
      action = 'advance';
      instruction =
        `孩子这一轮答对了，他的原话是："${input.text}"。` +
        `请先用一句非常简短、贴合他回答的英语鼓励（例如针对他说了的词汇/表达稍作回应，如 Great!/Well done!/So cute!/Nice!），` +
        `然后自然地问出下面这【唯一一个】问题：\n` +
        `"${nextTurn.ask}"\n` +
        `只输出这一轮该说的那一句英文，不要追加其它问题。`;
      replyZh = '';
    } else {
      // 脚本全部完成
      action = 'finish';
      finished = true;
      instruction =
        `孩子已经完成「${scene.title}」${scene.turns.length} 轮对话练习，都说得很好。` +
        '请用一句简短、温暖的英语表扬并收尾（可提到他提到的词汇/表达，例如 “Great talking with you! See you next time!”），不要再提出新问题。';
    }
  } else {
    // incorrect / incomplete：同一题累计，不推进
    state.missStreak += 1;
    state.updatedAt = Date.now();
    const attempt = state.missStreak;

    if (attempt >= 2) {
      action = 'retry_model';
      correction = {
        issue: evaluation.issue ?? turn.focus,
        modelAnswer: turn.modelAnswer,
        attempt,
      };
      instruction =
        `孩子这一轮连续 ${attempt} 次没有说对，他的原话是："${input.text}"。` +
        `请先温和地让他听示范，再请他跟读，只说一句英文，` +
        `要包含教材句型示范："${turn.modelAnswer}"。` +
        `例如可以说 "Listen: ${turn.modelAnswer} Now you say it!"。不要讲新内容、不要追问。`;
      replyZh = `小提示：${evaluation.issue ?? turn.focus} 听一听，我们一起读：${turn.modelAnswer}`;
    } else {
      action = 'retry_hint';
      correction = {
        issue: evaluation.issue ?? turn.focus,
        modelAnswer: turn.modelAnswer,
        attempt,
      };
      instruction =
        `孩子这一轮没有说对（第一次，不要直接给答案），他的原话是："${input.text}"，` +
        `问题类型为：${errorTypeLabel(evaluation.errorType)}，中文提示为：${evaluation.issue ?? turn.focus}。` +
        `请针对他这句话里的那个小问题，用一句非常简短、温和的英文引导他再试一次` +
        `（围绕问题 "${turn.ask}"，可顺着他已说对的词靠近，但不要把答案整句说出来），` +
        `不要重复一长串、不要提出新问题。可以说 "Try again, please." 之类。`;
      replyZh = `小提示：${evaluation.issue ?? turn.focus}`;
    }
  }

  // 强制约束：无论哪个分支，模型都只能把教学意图润色成一句英文；
  // 标准答案、页码、判定结果（verdict）与评分一律以服务端工作流为准，模型不得改。
  instruction +=
    '\n【硬性约束】你只负责输出这一轮单句英文教学话术（可配极简中文 replyZh）。' +
    '严禁自行给出/改变教材标准答案、页码或本题判定结果；不得引入教材外的词、不得跳题、不得加问句。';

  const generated = await generateReply(req, scene, instruction, input.history);
  // 中文提示以工作流判定为准（模型只负责英文），保证纠错信息确定可控
  if (replyZh) generated.replyZh = replyZh;

  return {
    reply: generated.reply,
    replyZh: generated.replyZh,
    verdict: evaluation.verdict,
    round: turn.round,
    question: turn.ask,
    sourceKind: evaluation.sourceKind,
    page: turn.page,
    matchedPattern: evaluation.matched,
    correction,
    finished,
    action,
    errorType: asrNote ? (evaluation.errorType === 'asr_empty' ? 'asr_empty' : 'asr_low_conf') : evaluation.errorType,
    asrNote,
    engine: 'builtin-doubao-workflow',
  };
}

/** 第二/三层：辅助函数 */

function errorTypeLabel(t: ErrorType): string {
  switch (t) {
    case 'grammar': return '语法错误';
    case 'word': return '词汇使用不当';
    case 'mismatch': return '与当前问题不匹配';
    case 'incomplete': return '表达不够完整';
    case 'asr_empty': return '未识别到语音';
    case 'asr_low_conf': return '识别置信度过低';
    default: return '需补全';
  }
}

/** ASR 低置信度 / 空结果的粗略判定（文本过短或明显像未识别 segments） */
function asrLowConfidence(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // 识别结果常见占位（如 "。"、单字、或纯标点）
  if (/^[。，.!?、\s]+$/.test(t)) return true;
  if (t.length <= 1) return true;
  // 仅由无意义单字母音节组成（ASR 常见噪音）
  if (/^([ywuhn] ?){1,4}$/i.test(t)) return true;
  return false;
}

/** 开始/获取一个场景的开场问题（不依赖学生先发话），并初始化会话 */
export function startScene(uid: string, sceneInput: string): {
  scene: SceneScript;
  opening: string;
  openingZh: string;
  round: number;
  page: number;
} {
  const sceneKey = SCENES[sceneInput] ? sceneInput : 'my-pet';
  const scene = SCENES[sceneKey];
  startSession(uid, sceneKey);
  const first = scene.turns[0];
  return {
    scene,
    opening: first.ask,
    openingZh: first.askZh,
    round: 1,
    page: first.page,
  };
}
