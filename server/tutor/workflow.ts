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

function evaluateAnswer(
  raw: string,
  turn: DialogueTurn,
): { verdict: Verdict; matched?: string; sourceKind: SourceKind; issue?: string } {
  const n = normalize(raw);
  if (!n) return { verdict: 'incomplete', sourceKind: 'adapted' };

  // 优先级最高：硬性语法错误（如 I has ...），即使句子里含正确宠物词也必须先拦下纠错。
  // 不能让 "I has a dog." 因命中可接受简化答法 "a dog" 而被误判为正确。
  const hardIssue = detectHardGrammarError(n);
  if (hardIssue) {
    return { verdict: 'incorrect', sourceKind: 'adapted', issue: hardIssue };
  }

  const textbookHit = matches(n, turn.expectedPatterns);
  if (textbookHit) {
    return { verdict: 'correct', matched: textbookHit, sourceKind: 'textbook' };
  }

  // 第二轮：只说宠物名等不完整表达（不是 I has 硬错）→ 提示说完整句，属于 incomplete
  const softIssue = detectSoftIncompleteness(n, turn);
  if (softIssue) {
    return { verdict: 'incomplete', sourceKind: 'adapted', issue: softIssue };
  }

  const acceptHit = matches(n, turn.acceptablePatterns);
  if (acceptHit) {
    // 可接受的简化/同义答法算正确，但标记为教学改编，不是教材完整原句
    return { verdict: 'correct', matched: acceptHit, sourceKind: 'adapted' };
  }

  return {
    verdict: 'incomplete',
    sourceKind: 'adapted',
    issue: `这一轮我们练：${turn.focus}。`,
  };
}

/** 硬性语法错误：三年级明确要纠正的点（第一阶段：I has → I have） */
function detectHardGrammarError(normalized: string): string | null {
  if (/\bi has\b/.test(normalized)) {
    return '说“我有……”的时候，I（我）后面要用 have，不能用 has。';
  }
  return null;
}

/** 软性不完整：答案能理解但没说完整句（如第二轮只报宠物名） */
function detectSoftIncompleteness(normalized: string, turn: DialogueTurn): string | null {
  if (turn.round === 2) {
    const onlyWord = matches(normalized, ['a dog', 'a cat', 'a fish', 'a bird', 'a rabbit', 'dog', 'cat', 'fish', 'bird', 'rabbit']);
    if (onlyWord) {
      return '能把单词升级成完整句子吗？试试用 “I have a …” 来说。';
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

  if (evaluation.verdict === 'correct') {
    state.missStreak = 0;
    state.answered += 1;
    state.roundIndex += 1;
    state.updatedAt = Date.now();

    const nextTurn = scene.turns[state.roundIndex];
    if (nextTurn) {
      action = 'advance';
      instruction =
        `孩子这一轮答对了（${turn.round === 1 ? '回答了 Do you have a pet?' : '说出了宠物相关表达'}）。` +
        `请先用一句非常简短的英语鼓励（如 Great!/Well done!），然后自然地问出下面这【唯一一个】问题：\n` +
        `"${nextTurn.ask}"\n` +
        `只输出这一轮该说的那一句英文，不要追加其它问题。`;
      replyZh = '';
    } else {
      // 脚本全部完成
      action = 'finish';
      finished = true;
      instruction =
        '孩子已经完成 My Pet 宠物对话的全部练习，都说得很好。请用一句简短、温暖的英语表扬并收尾' +
        '（可提到他的宠物，例如 “Great talking with you! See you next time!”），不要再提出新问题。';
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
        `孩子这一轮连续 ${attempt} 次没有说对。请先温和地让他听示范，再请他跟读，只说一句英文，` +
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
        `孩子这一轮没有说对，但这是第一次，请不要直接给答案。用一句非常简短、温和的英文请他再试一次` +
        `（围绕问题 "${turn.ask}"），不要重复一长串、不要提出新问题。可以说 "Try again, please." 之类。`;
      replyZh = `小提示：${evaluation.issue ?? turn.focus}`;
    }
  }

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
    engine: 'builtin-doubao-workflow',
  };
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
