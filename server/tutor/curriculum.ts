/**
 * Unit 3《Our animal friends》本地结构化教材知识源（第二阶段 2A：全单元 p26-p37 文本 + 教材原声清单）。
 *
 * 实现方式如实说明：
 * - 这里【不是】平台 Knowledge/RAG 检索，而是把审核过的教材内容按
 *   Part / 页码 / 词汇 / 句型 / 对话脚本组织成服务端结构化数据，
 *   由教学工作流精确注入给内置模型，杜绝旧版 "Amazing animals" 内容混入。
 * - 文本依据：assets/01_教材知识库_核对版.md 与 assets/08_教材页码核对索引.csv（均标「已核对原图」）。
 * - 标记 kind：
 *     textbook  = 教材可见原文（可作为评分依据）
 *     adapted   = 教学改编（用于引导/鼓励，不作为学生必须复述的答案）
 * - 音频对应：assets/说明文档.md + server/tutor/audio.ts（10 段真实 MP3，见 UNIT_AUDIO）。
 *   音频的文字逐字核验/听力答案核验均为「未完成」，一律标 pending，绝不据文件名伪造原声文字/答案。
 * - 拼音/字母发音等未核验的答案统一进「待核验」区，禁止进入自动评分。
 */

export type SentenceKind = 'textbook' | 'adapted';
export type VerificationState = 'verified' | 'pending';

/** 教材句型/词条 */
export interface CurriculumItem {
  /** 规范化后的小写英文，便于匹配学生回答 */
  pattern: string;
  /** 展示用英文（教材原拼写） */
  en: string;
  zh: string;
  page: number;
  part: 'A' | 'B' | 'C';
  kind: SentenceKind;
}

/** 宠物核心词汇（P29） */
export const PET_WORDS: CurriculumItem[] = [
  { pattern: 'dog', en: 'dog', zh: '狗', page: 29, part: 'A', kind: 'textbook' },
  { pattern: 'cat', en: 'cat', zh: '猫', page: 29, part: 'A', kind: 'textbook' },
  { pattern: 'fish', en: 'fish', zh: '鱼', page: 29, part: 'A', kind: 'textbook' },
  { pattern: 'bird', en: 'bird', zh: '鸟', page: 29, part: 'A', kind: 'textbook' },
  { pattern: 'rabbit', en: 'rabbit', zh: '兔子', page: 29, part: 'A', kind: 'textbook' },
];

/** P28 Part A Let's talk 教材可见原句 */
export const PET_TALK_SENTENCES: CurriculumItem[] = [
  { pattern: 'good morning mike', en: 'Good morning, Mike!', zh: '早上好，Mike！', page: 28, part: 'A', kind: 'textbook' },
  { pattern: 'do you have a pet', en: 'Do you have a pet?', zh: '你有宠物吗？', page: 28, part: 'A', kind: 'textbook' },
  { pattern: "no i don't", en: "No, I don't.", zh: '不，我没有。', page: 28, part: 'A', kind: 'textbook' },
  { pattern: 'yes i do i have a cat', en: 'Yes, I do. I have a cat.', zh: '是的，我有。我有一只猫。', page: 28, part: 'A', kind: 'textbook' },
  { pattern: 'yes i do i have a dog', en: 'Yes, I do. I have a dog.', zh: '是的，我有。我有一只狗。', page: 28, part: 'A', kind: 'textbook' },
  { pattern: 'i like your dog', en: 'I like your dog.', zh: '我喜欢你的狗。', page: 28, part: 'A', kind: 'textbook' },
];

/**
 * 一轮对话脚本（来自 assets/04_情境对话方案.json 的 pet_dialogue，max_rounds 见该文件）。
 * 服务端工作流据此推进，保证「一次只问一个问题」。
 */
export interface DialogueTurn {
  /** 第几轮（学生回答序号，从 1 开始） */
  round: number;
  /** Rex 这一轮向学生提出的问题（英文，三年级水平） */
  ask: string;
  askZh: string;
  /** 学生这一轮的教材目标句型（规范化小写） */
  expectedPatterns: string[];
  /** 可接受的同义/扩展答法（规范化小写），adapted 不计入教材原句得分 */
  acceptablePatterns: string[];
  /** 本句核心教材出处页码 */
  page: number;
  /** 学生答不出/连续错时给出的教材句型示范 */
  modelAnswer: string;
  /** 本题考察点（用于纠错与反馈） */
  focus: string;
}

export const PET_DIALOGUE: DialogueTurn[] = [
  {
    round: 1,
    ask: 'Good morning! Do you have a pet?',
    askZh: '早上好！你有宠物吗？',
    expectedPatterns: ['yes i do', "no i don't"],
    acceptablePatterns: ['yes', 'yes i have', 'no', 'i have a pet', "i don't have a pet"],
    page: 28,
    modelAnswer: 'Yes, I do.',
    focus: "用 Yes, I do. / No, I don't. 回答 Do you have...? 一般疑问句",
  },
  {
    round: 2,
    ask: 'Great! What pet do you have?',
    askZh: '太棒了！你有什么宠物呀？',
    expectedPatterns: ['i have a dog', 'i have a cat', 'i have a fish', 'i have a bird', 'i have a rabbit'],
    acceptablePatterns: ['a dog', 'a cat', 'a fish', 'a bird', 'a rabbit', 'dog', 'cat', 'fish', 'bird', 'rabbit'],
    page: 28,
    modelAnswer: 'I have a dog.',
    focus: '用 I have a + 宠物词 回答拥有什么宠物；主语 I 后用 have 不用 has',
  },
  {
    round: 3,
    ask: 'So cute! What can your pet do?',
    askZh: '真可爱！你的宠物会做什么呀？',
    expectedPatterns: ['it can run', 'it can swim', 'it can sing', 'it can hop'],
    acceptablePatterns: [
      'run', 'swim', 'sing', 'hop',
      'it runs', 'it swims', 'it can run fast', 'my dog can run', 'dogs can run',
    ],
    page: 29,
    modelAnswer: 'It can run.',
    focus: '用 It can + 动作动词（Run/Swim/Sing/Hop）描述宠物会做的动作（P29）',
  },
];

/** 场景元数据（第一阶段只开放 my-pet 真实工作流；zoo 第二阶段） */
export interface SceneScript {
  key: string;
  title: string;
  turns: DialogueTurn[];
  /** 注入给模型的教材知识块（原文，供其严格依据） */
  knowledgeBlock: string;
  pages: number[];
}

export const MY_PET_SCENE: SceneScript = {
  key: 'my-pet',
  title: 'My Pet',
  turns: PET_DIALOGUE,
  pages: [28, 29],
  knowledgeBlock: `【人教版（PEP）三年级上册 Unit 3 Our animal friends — Part A，仅可使用以下教材内容】

P28 Let's talk 教材原句：
- Good morning, Mike!
- Do you have a pet?
- No, I don't.
- Yes, I do. I have a cat.
- Yes, I do. I have a dog.
- I like your dog.

P29 宠物核心词（只能从这 5 个里选宠物）：
- dog（狗）、cat（猫）、fish（鱼）、bird（鸟）、rabbit（兔子）

P29 动作表达：
- Run like a dog. / Sleep like a cat. / Sing like a bird. / Hop like a rabbit. / Swim like a fish.
- 描述宠物会做某事用：It can + 动词（run / swim / sing / hop / sleep）。

语法边界（三年级，不要超纲）：
- 一般疑问句 Do you have...? 用 Yes, I do. / No, I don't. 回答。
- 表示“我有……”用 I have ...；主语是 I 时只能用 have，不能用 has。
- 不要出现 fox、red panda、giraffe 等其它单元/野生动物词作为本场景宠物。`,
};

/* =========================================================================
 * 第二阶段 2B：At the Zoo 场景（Part B：P31 P32 P33）
 *
 * 教材范围（严格受教材约束，绝不混入旧版 Amazing animals）：
 * - P32 Part B Let's learn 五个核心野生动物词（已核对原图，可作评分依据）：
 *     panda / monkey / tiger / elephant / lion
 * - P33 Part B Start to read 特征词（已核对原图，可作评分依据）：big / small / tall / fast
 * - P31 Part B Let's talk 为野生动物对话情境（fox / red panda 出现），
 *   但该页【对话原句暂未逐字核验】→ 引导句型一律标 adapted，不作评分原句；
 *   只把 P32/P33 已核验词汇作为确定性评分依据。
 * - P34 Part C Project（动物图画书）不作为本场景对话内容。
 * ========================================================================= */

/** P32 五个核心野生动物词（已核验，可评分） */
export const ZOO_WORDS: CurriculumItem[] = [
  { pattern: 'panda', en: 'panda', zh: '熊猫', page: 32, part: 'B', kind: 'textbook' },
  { pattern: 'monkey', en: 'monkey', zh: '猴子', page: 32, part: 'B', kind: 'textbook' },
  { pattern: 'tiger', en: 'tiger', zh: '老虎', page: 32, part: 'B', kind: 'textbook' },
  { pattern: 'elephant', en: 'elephant', zh: '大象', page: 32, part: 'B', kind: 'textbook' },
  { pattern: 'lion', en: 'lion', zh: '狮子', page: 32, part: 'B', kind: 'textbook' },
];

/** P33 特征词（已核验，可作评分依据） */
export const ZOO_ATTRIBUTES: CurriculumItem[] = [
  { pattern: 'big', en: 'big', zh: '大的', page: 33, part: 'B', kind: 'textbook' },
  { pattern: 'small', en: 'small', zh: '小的', page: 33, part: 'B', kind: 'textbook' },
  { pattern: 'tall', en: 'tall', zh: '高的', page: 33, part: 'B', kind: 'textbook' },
  { pattern: 'fast', en: 'fast', zh: '快的', page: 33, part: 'B', kind: 'textbook' },
];

/**
 * At the Zoo 对话脚本（3–5 轮；引导句型多为教学改编 adapted，
 * 只有明确的核心词评分依据落在 P32/P33 已核验词汇上）。
 */
export const ZOO_DIALOGUE: DialogueTurn[] = [
  {
    round: 1,
    ask: 'Hello! We are at the zoo today. What animals do you see?',
    askZh: '你好！今天我们来到动物园。你看到了哪些动物呀？',
    // 情境导入 + 动物识别：说出任意一个 P32 核心动物就算答对
    expectedPatterns: ['i see a panda', 'i see a monkey', 'i see a tiger', 'i see an elephant', 'i see a lion'],
    acceptablePatterns: ['panda', 'monkey', 'tiger', 'elephant', 'lion', 'a panda', 'a monkey', 'a tiger', 'an elephant', 'a lion', 'i see pandas', 'i see monkeys'],
    page: 32,
    modelAnswer: 'I see a panda.',
    focus: '用 I see a + 动物词 说出在动物园看到的动物（用 P32 词汇：panda/monkey/tiger/elephant/lion）',
  },
  {
    round: 2,
    ask: 'Good! What animal is it?',
    askZh: '很好！这是什么动物呀？',
    expectedPatterns: ["it's a panda", "it's a monkey", "it's a tiger", "it's an elephant", "it's a lion"],
    acceptablePatterns: ['panda', 'monkey', 'tiger', 'elephant', 'lion', 'a panda', 'a monkey', 'a tiger', 'an elephant', 'a lion', "it's panda", "it's monkey"],
    page: 32,
    modelAnswer: "It's a monkey.",
    focus: '用 It’s a + 动物词 回答这是什么动物（元音音素前用 an，如 an elephant）',
  },
  {
    round: 3,
    ask: 'Nice! What does the elephant look like?',
    askZh: '真棒！这头大象看起来怎么样？',
    expectedPatterns: ['it is big', "it's big", 'it is small', "it's small", 'it is tall', "it's tall", 'it is fast', "it's fast"],
    acceptablePatterns: ['big', 'small', 'tall', 'fast', 'it is very big', "it's very big", 'very big', 'very small'],
    page: 33,
    modelAnswer: "It's big.",
    focus: "用 It's + 特征词（big / small / tall / fast）描述动物特征（P33）",
  },
  {
    round: 4,
    ask: 'What animal do you like?',
    askZh: '你喜欢什么动物呀？',
    expectedPatterns: ['i like the panda', 'i like the monkey', 'i like the tiger', 'i like the elephant', 'i like the lion'],
    acceptablePatterns: ['panda', 'monkey', 'tiger', 'elephant', 'lion', 'the panda', 'the monkey', 'i like pandas', 'i like monkeys', 'i like elephants'],
    page: 32,
    modelAnswer: 'I like the panda.',
    focus: '用 I like the + 动物词 说出你喜欢的动物（综合运用）',
  },
];

/** At the Zoo 场景（Part B） */
export const AT_THE_ZOO_SCENE: SceneScript = {
  key: 'at-the-zoo',
  title: 'At the Zoo',
  turns: ZOO_DIALOGUE,
  pages: [31, 32, 33],
  knowledgeBlock: `【人教版（PEP）三年级上册 Unit 3 Our animal friends — Part B，仅可使用以下教材内容】

P32 Part B Let's learn 核心野生动物词（只能从这 5 个里选，可评分）：
- panda（熊猫）、monkey（猴子）、tiger（老虎）、elephant（大象）、lion（狮子）
- 注意：elephant 以元音音素开头，要说 an elephant。

P33 Part B Start to read 特征词（可评分）：
- big（大的）、small（小的）、tall（高的）、fast（快的）
- 描述动物特征用："It's big." / "It's small."

P31 Part B Let's talk 情境（狐狸 fox 与小熊猫 red panda 出现）：
- 该页对话原句【尚未逐字核验】，不作为评分依据；只作情境引导。

语法边界（三年级，不要超纲）：
- 一般疑问句 What animal is it? 用 "It's a + 动物词" 回答。
- 描述特征用 "It's + 特征词"。
- 表达喜欢用 "I like the + 动物词"。
- 不要在动物园场景混入宠物词 dog/cat/fish/bird/rabbit 作为场景主角，也不要混入其它单元野生动物的过期教材内容。`,
};

export const SCENES: Record<string, SceneScript> = {
  'my-pet': MY_PET_SCENE,
  // 前端场景 key 'pet' 与历史数据兼容
  pet: MY_PET_SCENE,
  // 第二阶段 2B：At the Zoo（key 兼容前端 'zoo'）
  'at-the-zoo': AT_THE_ZOO_SCENE,
  zoo: AT_THE_ZOO_SCENE,
};

/* =========================================================================
 * 第二阶段 2A 追加：全单元结构化知识源（p26–p37）
 * 文本已核对原图（assets/01 + 08）；音频对应见 server/tutor/audio.ts
 * ========================================================================= */

/** 词汇分层（资产 assets/02_词汇分层表.csv，33 词） */
export type VocabScope = '核心' | '阅读重点' | '听做活动' | '教材拓展' | '字母与发音' | '拼读拓展';

export interface VocabularyItem {
  word: string;
  zh: string;
  section: string;
  page: number;
  scope: VocabScope;
  /** 是否可用于听写评分：仅核心/阅读重点经审核后可用，其余标 false */
  scorable: boolean;
}

/** 全单元词汇（严格取自 assets/02_词汇分层表.csv） */
export const UNIT_VOCABULARY: VocabularyItem[] = [
  // 核心（P29 宠物 / P32 野生动物），可评分
  { word: 'dog', zh: '狗', section: 'Part A Let’s learn', page: 29, scope: '核心', scorable: true },
  { word: 'cat', zh: '猫', section: 'Part A Let’s learn', page: 29, scope: '核心', scorable: true },
  { word: 'fish', zh: '鱼', section: 'Part A Let’s learn', page: 29, scope: '核心', scorable: true },
  { word: 'bird', zh: '鸟', section: 'Part A Let’s learn', page: 29, scope: '核心', scorable: true },
  { word: 'rabbit', zh: '兔子', section: 'Part A Let’s learn', page: 29, scope: '核心', scorable: true },
  { word: 'panda', zh: '熊猫', section: 'Part B Let’s learn', page: 32, scope: '核心', scorable: true },
  { word: 'monkey', zh: '猴子', section: 'Part B Let’s learn', page: 32, scope: '核心', scorable: true },
  { word: 'tiger', zh: '老虎', section: 'Part B Let’s learn', page: 32, scope: '核心', scorable: true },
  { word: 'elephant', zh: '大象', section: 'Part B Let’s learn', page: 32, scope: '核心', scorable: true },
  { word: 'lion', zh: '狮子', section: 'Part B Let’s learn', page: 32, scope: '核心', scorable: true },
  // 阅读重点（P33 Start to read）
  { word: 'big', zh: '大的', section: 'Part B Start to read', page: 33, scope: '阅读重点', scorable: true },
  { word: 'small', zh: '小的', section: 'Part B Start to read', page: 33, scope: '阅读重点', scorable: true },
  { word: 'tall', zh: '高的', section: 'Part B Start to read', page: 33, scope: '阅读重点', scorable: true },
  { word: 'fast', zh: '快的', section: 'Part B Start to read', page: 33, scope: '阅读重点', scorable: true },
  // 听做活动动作（P29 Listen and do）
  { word: 'run', zh: '跑', section: 'Part A Listen and do', page: 29, scope: '听做活动', scorable: false },
  { word: 'sleep', zh: '睡觉', section: 'Part A Listen and do', page: 29, scope: '听做活动', scorable: false },
  { word: 'sing', zh: '唱歌', section: 'Part A Listen and do', page: 29, scope: '听做活动', scorable: false },
  { word: 'hop', zh: '单脚跳/蹦跳', section: 'Part A Listen and do', page: 29, scope: '听做活动', scorable: false },
  { word: 'swim', zh: '游泳', section: 'Part A Listen and do', page: 29, scope: '听做活动', scorable: false },
  // 教材拓展（非 B 部分核心五词）
  { word: 'fox', zh: '狐狸', section: 'Part B Dialogue / Reading', page: 31, scope: '教材拓展', scorable: false },
  { word: 'red panda', zh: '小熊猫', section: 'Part B Dialogue / Reading', page: 31, scope: '教材拓展', scorable: false },
  { word: 'giraffe', zh: '长颈鹿', section: 'Part B Dialogue / Reading', page: 33, scope: '教材拓展', scorable: false },
  // 字母与发音（P30 Letters and sounds，义为辅助解释）
  { word: 'ill', zh: '生病的', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'kid', zh: '小孩', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'job', zh: '工作', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'jet', zh: '喷气式飞机', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'Kim', zh: '人名Kim', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'kite', zh: '风筝', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  { word: 'leg', zh: '腿', section: 'Letters and sounds', page: 30, scope: '字母与发音', scorable: false },
  // 拼读拓展（仅拼读，不建议三年级首轮听写）
  { word: 'dig', zh: '挖', section: 'Can you read the words?', page: 30, scope: '拼读拓展', scorable: false },
  { word: 'Jim', zh: '人名Jim', section: 'Can you read the words?', page: 30, scope: '拼读拓展', scorable: false },
  { word: 'lab', zh: '实验室', section: 'Can you read the words?', page: 30, scope: '拼读拓展', scorable: false },
  { word: 'led', zh: 'lead的过去式', section: 'Can you read the words?', page: 30, scope: '拼读拓展', scorable: false },
];

/** 页码 → 栏目汇总（assets/08，已核对原图） */
export interface PageSection { page: number; section: string; content: string; }

export const PAGE_SECTIONS: PageSection[] = [
  { page: 26, section: 'Unit overview', content: '单元封面' },
  { page: 27, section: 'Look and think / Listen and chant', content: '导入、单元主题与韵文' },
  { page: 28, section: "Part A Let's talk / Do a survey", content: '宠物交流与调查（含 My Pet 对话场景）' },
  { page: 29, section: "Part A Let's learn / Listen and do", content: '宠物词汇（dog/cat/fish/bird/rabbit）与动作' },
  { page: 30, section: 'Part A Letters and sounds', content: '字母 Ii/Jj/Kk/Ll 和音素练习；听音选择无原声答案' },
  { page: 31, section: "Part B Let's talk / Play with hand shadows", content: '野生动物对话（fox/red panda 情境，非 p32 核心五词）、手影' },
  { page: 32, section: "Part B Let's learn / Listen and chant", content: '五个重点野生动物词 panda/monkey/tiger/elephant/lion' },
  { page: 33, section: 'Part B Start to read', content: '动物特征与归类；词表含 bird,cat,dog,elephant,fish,giraffe,lion,monkey,panda,rabbit,tiger' },
  { page: 34, section: 'Part C Project: Make an animal picture book', content: '项目任务第 1、2 步；第 1 步无音频答案（P34 Listen and circle 未核验不评分）' },
  { page: 35, section: 'Part C Project / Self-check', content: '项目制作与自评' },
  { page: 36, section: 'Reading time', content: '拓展阅读第一部分' },
  { page: 37, section: 'Reading time', content: '拓展阅读第二部分' },
];

/** 字母训练范围（P30，08 索引已核对） */
export const LETTERS_A: string[] = ['Ii', 'Jj', 'Kk', 'Ll'];

/**
 * 易错表达与纠错建议（受教材范围约束）。
 * 用于教学工作流在学生答错时给出确定性纠错 + 豆包润色提示，不改变标准答案与评分。
 */
export interface MisuseRule {
  /** 触发错误原串（规范化小写） */
  error: string;
  /** 正确表达（规范化小写） */
  correct: string;
  /** 一句话中文纠错建议（三年级可懂） */
  hintZh: string;
  /** 教材示范（规范化小写，须来自课本原句） */
  textbookDemo: string;
  page: number;
  part: 'A' | 'B' | 'C';
}

export const MISUSE_RULES: MisuseRule[] = [
  {
    error: 'i has', correct: 'i have',
    hintZh: '说“我有……”的时候，I 后面要用 have，不能用 has。',
    textbookDemo: 'yes i do. i have a cat.', page: 28, part: 'A',
  },
  {
    error: 'a elephant', correct: 'an elephant',
    hintZh: 'elephant 是元音音素开头，要说 an elephant；元音音素前用 an，辅音音素前用 a。',
    textbookDemo: "it's an elephant.", page: 32, part: 'B',
  },
  {
    error: 'an dog', correct: 'a dog',
    hintZh: 'dog 是辅音音素开头，要说 a dog，不能说 an dog。',
    textbookDemo: 'yes i do. i have a dog.', page: 28, part: 'A',
  },
];

/** 场景 → 应关联的教材原声（audio.ts 的 UNIT_AUDIO id） */
export const SCENE_AUDIO_IDS: Record<string, string[]> = {
  'my-pet': ['U03_01', 'U03_02', 'U03_03'],
  pet: ['U03_01', 'U03_02', 'U03_03'],
  // 第二阶段 2B：启用 Part B 教材原声（P31 Let's talk / P32 chant / P33 read）
  'at-the-zoo': ['U03_07', 'U03_08', 'U03_09'],
  zoo: ['U03_07', 'U03_08', 'U03_09'],
};

/* =========================================================================
 * 待核验区（严禁进入自动评分 / 原声文字展示）
 * ========================================================================= */
export const PENDING_NOTES = {
  audio: '10 段教材 MP3 已上传对象存储并在 audio.ts 建清单，但录音文字逐字核验与听力答案核验均为未完成，不得据文件名伪造原声文字或听力答案。',
  p30FirstSound: 'P30 Listen and circle the first sound 无核对后的标准答案，不参与自动评分。',
  p34ListenCircle: 'P34 Listen and circle 未核验答案前不参与自动评分。',
  u0304u0305: 'U03_04 与 U03_05 标题相同但时长差异大，需试听核对后确定其包含内容。',
};
