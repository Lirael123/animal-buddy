/**
 * Unit 3《Our animal friends》服务端正式听写题库与固定评分。
 *
 * 实现方式如实说明：
 * - 题库来源于 assets/03_听写固定题库.json/csv（「已按可见教材逐页核对」的版本）。
 * - 只有 is_enabled=1 的题目才可用于正式练习（scorable=true）；
 *   拼读示例（ill/kid/job...）、动作词（run/sleep...）、拓展词（fox/giraffe）、
 *   P34 Listen and circle 因答案/语义尚未核验，一律禁止自动评分（scorable=false），
 *   也不得据此编造听力标准答案。
 * - 标准答案与评分【只在服务端】完成，浏览器只收到题目元信息（不含 standard_answer/acceptable）与评分结果。
 * - 评分是确定性规则（大小写/句末标点宽容、A2 已审核等价答案、a/an 缺失引导、ASR 不清不扣知识分），
 *   豆包只负责简短复习提示，绝不修改标准答案与最终判定。
 */

export type DictationType = 'word' | 'sentence';
export type DictationSource = 'textbook' | 'adapted';

/** 暴露给浏览器的题目（不含标准答案） */
export interface DictationPublic {
  id: string;
  type: DictationType;
  page: number;
  section: string;
  category: string;
  difficulty: string;
  scorable: boolean;
  /** 播放语音用的文本素材；教材原句=textbook，教学改编=adapted */
  audioText: string;
  source: DictationSource;
  /** 题型提示文案 */
  prompt: string;
}

/** 服务端完整题库项（含标准答案/可接受答案，仅供评分，不下发浏览器） */
export interface DictationItem extends DictationPublic {
  standardAnswer: string;
  acceptable: string[];
}

/** 现有题库子项（来自 assets/03）原始入口 */
interface RawItem {
  id: string;
  type: 'word' | 'sentence';
  page: number;
  section: string;
  category: string;
  audio_text: string;
  standard_answer: string;
  acceptable_answers?: string;
  is_enabled: 0 | 1;
  difficulty: string;
}

/**
 * 题库：只收录「已核对且启用」的 33 题为 scorable 正式题；
 * 其余推理（拼读/动作/拓展等）也登记在案但 scorable=false，绝不自动评分。
 */
function build(inputs: RawItem[]): DictationItem[] {
  return inputs.map((r) => {
    let acceptable: string[] = [];
    try {
      acceptable = JSON.parse(r.acceptable_answers ?? '[]');
    } catch {
      acceptable = [];
    }
    if (!Array.isArray(acceptable) || acceptable.length === 0) acceptable = [r.standard_answer];

    // 拼读示例/动作词/拓展词/P34 circle 均非正式评分对象
    return {
      id: r.id,
      type: r.type,
      page: r.page,
      section: r.section,
      category: r.category,
      difficulty: r.difficulty,
      scorable: r.is_enabled === 1,
      audioText: r.audio_text,
      source: r.type === 'sentence' ? 'textbook' : 'adapted',
      prompt: promptFor(r),
      standardAnswer: r.standard_answer,
      acceptable: acceptable.map((a) => normalizeWord(a)),
    };
  });
}

function promptFor(r: RawItem): string {
  if (r.type === 'sentence') return '听一听，把完整句子写下来吧。';
  return '仔细听，试着拼写这个单词。';
}

/** 归一化：仅对单词答案统一小写、去两端空白与句末标点；句子保留但忽略大小写与句末标点 */
export function normalizeWord(s: string): string {
  return s.trim().toLowerCase().replace(/[.。!！?？]+$/g, '').trim();
}

/** 句子归一化：小写 + 展开常见缩写 + 去标点/撇号 + 折叠空白（与 workflow.normalize 口径一致） */
function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdont\b/g, 'do not')
    .replace(/\bdidn't\b/g, 'did not')
    .replace(/\bdidnt\b/g, 'did not')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bcant\b/g, 'cannot')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\blet's\b/g, 'let us')
    .replace(/[.,!?;:"'’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 给浏览器用的题目（剥离标准答案） */
export function toPublic(item: DictationItem): DictationPublic {
  return {
    id: item.id,
    type: item.type,
    page: item.page,
    section: item.section,
    category: item.category,
    difficulty: item.difficulty,
    scorable: item.scorable,
    audioText: item.audioText,
    source: item.source,
    prompt: item.prompt,
  };
}

/** 按类型可用的题目（正式练习只用 scorable） */
export function pickDictationPool(type?: DictationType | string): DictationItem[] {
  const pool = DICTATION_ITEMS.filter((i) => i.scorable);
  if (type) return pool.filter((i) => i.type === type);
  // 默认：单词与句型混排（先单词后句子），保持稳定顺序
  return [...pool.filter((i) => i.type === 'word'), ...pool.filter((i) => i.type === 'sentence')];
}

export function getDictationItem(id: string): DictationItem | undefined {
  return DICTATION_ITEMS.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// 评分（服务端确定性规则，不下发）
// ---------------------------------------------------------------------------

export type ScoreStatus = 'correct' | 'grammar' | 'word' | 'missing_article' | 'unclear' | 'wrong';

export interface DictationScore {
  status: ScoreStatus;
  /** 词汇理解是否达标（用于词汇/句型分离记录） */
  vocabOk: boolean;
  /** 句型表达是否达标 */
  formOk: boolean;
  /** 对三年级温和的引导提示（服务端生成，可含教材规范表达，不含整套题库答案） */
  hint: string;
  /** 教材规范表达（答错后展示，服务端下发） */
  reference: string;
  /** 是否因 ASR 不清而不计分 */
  asrSkipped: boolean;
}

/**
 * 单一评分子题（单词）：忽略大小写，单词本身不允许容错拼写；
 * 但“语义等价”（如 fish 单复数）按题库 acceptable 判定。
 */
function scoreWord(student: string, item: DictationItem): DictationScore {
  const n = normalizeWord(student);
  const correct = item.acceptable.includes(n) || n === normalizeWord(item.standardAnswer);
  return {
    status: correct ? 'correct' : 'wrong',
    vocabOk: correct,
    formOk: correct,
    hint: correct
      ? '太棒了，拼写正确！'
      : `这个词再想想看，注意首字母和元音，对照教材再听一遍试试。`,
    reference: item.standardAnswer,
    asrSkipped: false,
  };
}

/**
 * 单一评分子题（句子）：区分“词汇全部正确”与“句型规范”。
 * - 大小写、句末标点宽容；
 * - 仅缺 a/an/the 等限定词但不影响语义 → vocabOk=true、formOk=false，给「词汇正确 + 规范表达提醒」；
 * - 单词拼写整体贴近但语法（如 has/have、漏词）错 → 按 grammar/word 提示。
 */
function scoreSentence(student: string, item: DictationItem): DictationScore {
  const sn = normalizeSentence(student);
  const an = normalizeSentence(item.standardAnswer);
  if (sn === an) {
    return { status: 'correct', vocabOk: true, formOk: true, hint: '句子写对了，真棒！', reference: item.standardAnswer, asrSkipped: false };
  }
  // 可接受等价答案
  for (const alt of item.acceptable) {
    if (sn === normalizeSentence(alt)) {
      return { status: 'correct', vocabOk: true, formOk: true, hint: '句子写对了，真棒！', reference: item.standardAnswer, asrSkipped: false };
    }
  }

  const sTokens = tokenize(sn);
  const aTokens = tokenize(an);

  // 仅缺限定词（the/a/an）：教材单词都已写出，只差 a/an/the
  const missingArticle = missingOnlyArticles(sTokens, aTokens);
  if (missingArticle) {
    return {
      status: 'missing_article',
      vocabOk: true,
      formOk: false,
      hint: `单词你都写对啦！这里还差一个小词：${
        item.standardAnswer.includes(' an ') ? 'an' : 'a'
      }，补上句子就完整了。`,
      reference: item.standardAnswer,
      asrSkipped: false,
    };
  }

  // has/have 等语法错误
  if (sTokens.includes('has') && / have /i.test(` ${normalizeSentence(item.standardAnswer)} `)) {
    return {
      status: 'grammar',
      vocabOk: true,
      formOk: false,
      hint: '说“我有”时，I 后面要用 have，不能用 has。想想看，再写一遍。',
      reference: item.standardAnswer,
      asrSkipped: false,
    };
  }

  // 内容关键词缺失/拼错 → 词汇未完全掌握
  const vocabMiss = aTokens.filter((t) => t.length > 1 && !BLANK_WORDS.has(t)).some((t) => !sTokens.includes(t));
  if (vocabMiss && contentOverlap(sTokens, aTokens) < 0.5) {
    return {
      status: 'word',
      vocabOk: false,
      formOk: false,
      hint: '有些单词还没写出来呢，再听一遍，试着把每个单词都写全哦。',
      reference: item.standardAnswer,
      asrSkipped: false,
    };
  }

  return {
    status: 'grammar',
    vocabOk: true,
    formOk: false,
    hint: '句子意思对啦，但顺序或细节再调整一下就更好了，对照示范读一读。',
    reference: item.standardAnswer,
    asrSkipped: false,
  };
}

/** 只看是否为“仅缺限定词” */
function missingOnlyArticles(studentTokens: string[], answerTokens: string[]): boolean {
  const artOf = (t: string[]) => t.filter((x) => /^(the|a|an)$/.test(x));
  const sNo = studentTokens.filter((t) => !/^(the|a|an)$/.test(t));
  const aNo = answerTokens.filter((t) => !/^(the|a|an)$/.test(t));
  if (sNo.join(' ') !== aNo.join(' ')) return false; // 除冠词外还必须一致
  const wantarticles = artOf(answerTokens).length;
  return wantarticles > 0 && artOf(studentTokens).length === 0;
}

/** 极简分词 */
function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

const BLANK_WORDS = new Set(['i', 'you', 'it', 'a', 'an', 'the', 'to', 'and', 'do', 'dont', 'don','my','your','is','are','am','like','have']);

function contentOverlap(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  let hit = 0;
  for (const t of b) if (a.includes(t)) hit += 1;
  return hit / a.length;
}

/**
 * 对外主评分入口：对学生该题提交做正式判定。
 * - student 可能为空/极短（ASR 未识别）→ asrSkipped，不计知识分。
 */
export function scoreDictation(student: string, item: DictationItem, isAsr = false): DictationScore {
  const stripped = (student || '').trim();
  if (!stripped || (isAsr && stripped.length <= 1)) {
    return {
      status: 'unclear',
      vocabOk: false,
      formOk: false,
      hint: '抱歉，没有听清/没有输入，这次不记分，请再试一次。',
      reference: item.standardAnswer,
      asrSkipped: true,
    };
  }
  if (item.type === 'word') return scoreWord(stripped, item);
  return scoreSentence(stripped, item);
}

// ---------------------------------------------------------------------------
// 数据源：对照 assets/03_听写固定题库.json 的启用项
// ---------------------------------------------------------------------------

/** 正式评分题（scorable=true，33 题） */
export const DICTATION_ITEMS: DictationItem[] = build([
  // ---- Part A 宠物单词（P29，enabled）----
  { id: 'U3-001', type: 'word', page: 29, section: 'Part A Let’s learn', category: '宠物单词', difficulty: '基础', audio_text: 'dog', standard_answer: 'dog', acceptable_answers: '["dog"]', is_enabled: 1 },
  { id: 'U3-002', type: 'word', page: 29, section: 'Part A Let’s learn', category: '宠物单词', difficulty: '基础', audio_text: 'cat', standard_answer: 'cat', acceptable_answers: '["cat"]', is_enabled: 1 },
  { id: 'U3-003', type: 'word', page: 29, section: 'Part A Let’s learn', category: '宠物单词', difficulty: '基础', audio_text: 'fish', standard_answer: 'fish', acceptable_answers: '["fish"]', is_enabled: 1 },
  { id: 'U3-004', type: 'word', page: 29, section: 'Part A Let’s learn', category: '宠物单词', difficulty: '基础', audio_text: 'bird', standard_answer: 'bird', acceptable_answers: '["bird"]', is_enabled: 1 },
  { id: 'U3-005', type: 'word', page: 29, section: 'Part A Let’s learn', category: '宠物单词', difficulty: '基础', audio_text: 'rabbit', standard_answer: 'rabbit', acceptable_answers: '["rabbit"]', is_enabled: 1 },
  // ---- Part B 野生动物单词（P32，enabled）----
  { id: 'U3-006', type: 'word', page: 32, section: 'Part B Let’s learn', category: '野生动物单词', difficulty: '基础', audio_text: 'panda', standard_answer: 'panda', acceptable_answers: '["panda"]', is_enabled: 1 },
  { id: 'U3-007', type: 'word', page: 32, section: 'Part B Let’s learn', category: '野生动物单词', difficulty: '基础', audio_text: 'monkey', standard_answer: 'monkey', acceptable_answers: '["monkey"]', is_enabled: 1 },
  { id: 'U3-008', type: 'word', page: 32, section: 'Part B Let’s learn', category: '野生动物单词', difficulty: '基础', audio_text: 'tiger', standard_answer: 'tiger', acceptable_answers: '["tiger"]', is_enabled: 1 },
  { id: 'U3-009', type: 'word', page: 32, section: 'Part B Let’s learn', category: '野生动物单词', difficulty: '基础', audio_text: 'elephant', standard_answer: 'elephant', acceptable_answers: '["elephant"]', is_enabled: 1 },
  { id: 'U3-010', type: 'word', page: 32, section: 'Part B Let’s learn', category: '野生动物单词', difficulty: '基础', audio_text: 'lion', standard_answer: 'lion', acceptable_answers: '["lion"]', is_enabled: 1 },
  // ---- Part B 形容词（P33，enabled）----
  { id: 'U3-011', type: 'word', page: 33, section: 'Part B Start to read', category: '形容词', difficulty: '提高', audio_text: 'big', standard_answer: 'big', acceptable_answers: '["big"]', is_enabled: 1 },
  { id: 'U3-012', type: 'word', page: 33, section: 'Part B Start to read', category: '形容词', difficulty: '提高', audio_text: 'small', standard_answer: 'small', acceptable_answers: '["small"]', is_enabled: 1 },
  { id: 'U3-013', type: 'word', page: 33, section: 'Part B Start to read', category: '形容词', difficulty: '提高', audio_text: 'tall', standard_answer: 'tall', acceptable_answers: '["tall"]', is_enabled: 1 },
  { id: 'U3-014', type: 'word', page: 33, section: 'Part B Start to read', category: '形容词', difficulty: '提高', audio_text: 'fast', standard_answer: 'fast', acceptable_answers: '["fast"]', is_enabled: 1 },
  // ---- 教材句子（P28/P29/P31，enabled）----
  { id: 'U3-029', type: 'sentence', page: 28, section: 'Part A Let’s talk', category: '教材句子', difficulty: '基础', audio_text: 'Do you have a pet?', standard_answer: 'Do you have a pet?', acceptable_answers: '["Do you have a pet?"]', is_enabled: 1 },
  { id: 'U3-030', type: 'sentence', page: 28, section: 'Part A Let’s talk', category: '教材句子', difficulty: '基础', audio_text: "Yes, I do.", standard_answer: "Yes, I do.", acceptable_answers: "[\"Yes, I do.\"]", is_enabled: 1 },
  { id: 'U3-031', type: 'sentence', page: 28, section: 'Part A Let’s talk', category: '教材句子', difficulty: '基础', audio_text: "No, I don't.", standard_answer: "No, I don't.", acceptable_answers: "[\"No, I don't.\"]", is_enabled: 1 },
  { id: 'U3-032', type: 'sentence', page: 28, section: 'Part A Let’s talk', category: '教材句子', difficulty: '基础', audio_text: 'I have a cat.', standard_answer: 'I have a cat.', acceptable_answers: '["I have a cat."]', is_enabled: 1 },
  { id: 'U3-033', type: 'sentence', page: 28, section: 'Part A Let’s talk', category: '教材句子', difficulty: '基础', audio_text: 'I like your dog.', standard_answer: 'I like your dog.', acceptable_answers: '["I like your dog."]', is_enabled: 1 },
  { id: 'U3-034', type: 'sentence', page: 29, section: 'Part A Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'I like fish.', standard_answer: 'I like fish.', acceptable_answers: '["I like fish."]', is_enabled: 1 },
  { id: 'U3-035', type: 'sentence', page: 29, section: 'Part A Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'I like cats.', standard_answer: 'I like cats.', acceptable_answers: '["I like cats."]', is_enabled: 1 },
  { id: 'U3-036', type: 'sentence', page: 29, section: 'Part A Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'I like birds.', standard_answer: 'I like birds.', acceptable_answers: '["I like birds."]', is_enabled: 1 },
  { id: 'U3-037', type: 'sentence', page: 29, section: 'Part A Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'I like rabbits.', standard_answer: 'I like rabbits.', acceptable_answers: '["I like rabbits."]', is_enabled: 1 },
  { id: 'U3-038', type: 'sentence', page: 31, section: 'Part B Let’s talk', category: '教材句子', difficulty: '提高', audio_text: "Let's go to the zoo!", standard_answer: "Let's go to the zoo!", acceptable_answers: "[\"Let's go to the zoo!\"]", is_enabled: 1 },
  { id: 'U3-039', type: 'sentence', page: 31, section: 'Part B Let’s talk', category: '教材句子', difficulty: '基础', audio_text: "What's this?", standard_answer: "What's this?", acceptable_answers: "[\"What's this?\"]", is_enabled: 1 },
  { id: 'U3-040', type: 'sentence', page: 31, section: 'Part B Let’s talk', category: '教材句子', difficulty: '基础', audio_text: 'This is a pig.', standard_answer: 'This is a pig.', acceptable_answers: '["This is a pig."]', is_enabled: 1 },
  { id: 'U3-041', type: 'sentence', page: 32, section: 'Part B Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'I see a monkey.', standard_answer: 'I see a monkey.', acceptable_answers: '["I see a monkey."]', is_enabled: 1 },
  { id: 'U3-042', type: 'sentence', page: 32, section: 'Part B Let’s learn', category: '教材句子', difficulty: '基础', audio_text: 'It is a tiger.', standard_answer: 'It is a tiger.', acceptable_answers: '["It is a tiger."]', is_enabled: 1 },
  { id: 'U3-043', type: 'sentence', page: 33, section: 'Part B Start to read', category: '教材句子', difficulty: '提高', audio_text: 'The elephant is big.', standard_answer: 'The elephant is big.', acceptable_answers: '["The elephant is big."]', is_enabled: 1 },
  { id: 'U3-044', type: 'sentence', page: 33, section: 'Part B Start to read', category: '教材句子', difficulty: '提高', audio_text: 'The lion is fast.', standard_answer: 'The lion is fast.', acceptable_answers: '["The lion is fast."]', is_enabled: 1 },
  // ---- P34 Listen and circle 与未启用项（登记但不参与评分）----
  { id: 'U3-045', type: 'word', page: 34, section: 'Part C Listen and circle', category: '听力选择题', difficulty: '提高', audio_text: 'circle', standard_answer: 'CIRCLE_PENDING', acceptable_answers: '[]', is_enabled: 0 },
  { id: 'U3-046', type: 'word', page: 34, section: 'Part C Listen and circle', category: '听力选择题', difficulty: '提高', audio_text: 'circle', standard_answer: 'CIRCLE_PENDING', acceptable_answers: '[]', is_enabled: 0 },
]);

// 校验：正式题数量
export const ENABLED_COUNT = DICTATION_ITEMS.filter((i) => i.scorable).length;
