/**
 * Unit 3《Our animal friends》本地结构化教材知识源（第一阶段：My Pet）。
 *
 * 实现方式如实说明：
 * - 这里【不是】平台 Knowledge/RAG 检索，而是把审核过的教材内容按
 *   Part / 页码 / 词汇 / 句型 / 对话脚本组织成服务端结构化数据，
 *   由教学工作流精确注入给内置模型，杜绝旧版 "Amazing animals" 内容混入。
 * - 所有句子均来自 assets/01_教材知识库_核对版.md 中标注为「教材可见原文」的条目；
 *   标记 kind：
 *     textbook  = 教材可见原文（可作为评分依据）
 *     adapted   = 教学改编（用于引导/鼓励，不作为学生必须复述的答案）
 *
 * 第二阶段会扩充为 Part A/B/C 全单元（p26-p37）并接入教材 MP3。
 */

export type SentenceKind = 'textbook' | 'adapted';

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

export const SCENES: Record<string, SceneScript> = {
  'my-pet': MY_PET_SCENE,
  // 前端场景 key 'pet' 与历史数据兼容
  pet: MY_PET_SCENE,
};
