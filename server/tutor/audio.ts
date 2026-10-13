/**
 * Unit 3《Our animal friends》教材原声音频清单（第二阶段 2A）。
 *
 * 实现方式如实说明：
 * - 10 段 MP3 已真实上传至对象存储（audio/unit/ 前缀，见 assets/说明文档.md 的教材录音索引）。
 * - 持久化的是对象存储 key（永久有效）；前端播放时由服务端动态调用 generatePresignedUrl
 *   生成短期可播链接，绝不把临时链接写死，也不自行拼接 URL。
 * - 核验状态严格沿用 assets/说明文档.md 的结论：录音文字逐字核验、听力答案核验均为「未完成」；
 *   因此不得据文件名伪造原声文字或听力答案。凡未核验的页面一律标注 pending。
 */

export type VerificationState = 'verified' | 'pending';

export interface UnitAudio {
  /** 教材录音索引 id，如 U03_03 */
  id: string;
  /** 教材页码 */
  page: number;
  part: 'A' | 'B' | 'C';
  /** 教材栏目 / 活动名 */
  activity: string;
  /** 对象存储 key（永久，generatePresignedUrl 依据） */
  storageKey: string;
  /** 原文件名 */
  fileName: string;
  /** 录音文字逐字核验状态（true=已核对教材原图，false=可能含听力内容，未听写核对） */
  textVerified: VerificationState;
  /** 听力答案/题目答案核验状态 */
  answerVerified: VerificationState;
  /** 与教材页面匹配状态 */
  matchStatus: string;
}

/** 10 段教材原声（storageKey 来自真实上传，勿改动） */
export const UNIT_AUDIO: UnitAudio[] = [
  {
    id: 'U03_01', page: 27, part: 'A', activity: 'Look and think — Listen and chant',
    storageKey: 'audio/unit/U03_01_A_p27_chant_4baeebd7.mp3',
    fileName: 'U03_01_A_p27_chant.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_02', page: 27, part: 'A', activity: 'Look and think — Listen and sing',
    storageKey: 'audio/unit/U03_02_A_p27_song_9d1d8550.mp3',
    fileName: 'U03_02_A_p27_song.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_03', page: 28, part: 'A', activity: "Let's talk（宠物情境对话原声）",
    storageKey: 'audio/unit/U03_03_A_p28_talk_11e38eaf.mp3',
    fileName: 'U03_03_A_p28_talk.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_04', page: 30, part: 'A', activity: 'Letters and sounds — Listen, repeat and chant',
    storageKey: 'audio/unit/U03_04_A_p30_phonics_1_bf3b0ce9.mp3',
    fileName: 'U03_04_A_p30_phonics_1.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '标题匹配但与 U03_05 重复，需试听核对',
  },
  {
    id: 'U03_05', page: 30, part: 'A', activity: 'Letters and sounds — Listen, repeat and chant',
    storageKey: 'audio/unit/U03_05_A_p30_phonics_2_cdf346aa.mp3',
    fileName: 'U03_05_A_p30_phonics_2.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '标题同 U03_04 但时长更长，需试听核对',
  },
  {
    id: 'U03_06', page: 30, part: 'A', activity: 'Letters and sounds — Listen and circle the first sound',
    storageKey: 'audio/unit/U03_06_A_p30_first_sound_7f7db69a.mp3',
    fileName: 'U03_06_A_p30_first_sound.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_07', page: 31, part: 'B', activity: "Let's talk（动物园情境对话原声）",
    storageKey: 'audio/unit/U03_07_B_p31_talk_35d60d2e.mp3',
    fileName: 'U03_07_B_p31_talk.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_08', page: 32, part: 'B', activity: 'Listen and chant（野生动物词韵文）',
    storageKey: 'audio/unit/U03_08_B_p32_chant_7797f02b.mp3',
    fileName: 'U03_08_B_p32_chant.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_09', page: 33, part: 'B', activity: 'Start to read（动物特征阅读）',
    storageKey: 'audio/unit/U03_09_B_p33_read_22100fe5.mp3',
    fileName: 'U03_09_B_p33_read.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '教材页面标题匹配',
  },
  {
    id: 'U03_10', page: 34, part: 'C', activity: 'Project: Make an animal picture book',
    storageKey: 'audio/unit/U03_10_C_p34_project_8723f0a8.mp3',
    fileName: 'U03_10_C_p34_project.mp3',
    textVerified: 'pending', answerVerified: 'pending', matchStatus: '项目大标题匹配；是否含 P34 Listen and circle 需试听',
  },
];

export function getUnitAudio(id: string): UnitAudio | undefined {
  return UNIT_AUDIO.find((a) => a.id === id);
}

/** 按页码取教材原声（如 My Pet 场景需 U03_03 / P28） */
export function findAudioByPage(page: number): UnitAudio | undefined {
  return UNIT_AUDIO.find((a) => a.page === page);
}