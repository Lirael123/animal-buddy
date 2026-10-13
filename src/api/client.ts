/**
 * Animal Buddy 后端能力接口层。
 *
 * 状态说明（真实联通情况）：
 * --------------------------------------------------
 * ✅ 已真实接入（本云项目平台集成，后端 Express 路由 + coze-coding-dev-sdk）：
 *    - /api/asr          语音识别（英文）
 *    - /api/tts          语音合成（英文回复 → 可播放 mp3 URL）
 *    - /api/talk/start   开启场景，返回 Rex 教材脚本开场问题
 *    - /api/chat         内置教学智能体（服务端教学工作流 + 本地结构化教材知识 + 豆包生成反馈）
 *    - /api/talk/record  对话与纠错过程持久化（对象存储 JSON）
 *    - /api/audio        教材原声（Unit 3 的 10 段真实 MP3，对象存储 + 动态签名 URL）
 *
 * 内置智能体实现方式（如实说明，非平台 Knowledge/RAG）：
 *    教材内容以服务端结构化数据（server/tutor/curriculum.ts，Unit 3 P26-P37）组织，
 *    由教学工作流做确定性判定/轮次推进/纠错，豆包模型只负责把教学意图润色成
 *    适合三年级、可 TTS 的一句英文反馈。评分与推进不由模型自由决定。
 *    教材原声音频为对象存储中的真实 MP3（audio.ts 清单，播放前动态签名），非 TTS 替代。
 *
 * ❌ 仍待接入（第二/三阶段，不伪造连接）：
 *    - At the Zoo 场景教学工作流（第二阶段）
 *    - 服务端固定题库听写/评分、错题本、学习报告、教师端（第三阶段）
 * --------------------------------------------------
 */

export interface ASRResult {
  text: string;
  duration: number | null;
}
export interface TTSResult {
  audioUri: string;
  audioSize: number;
}

export type TutorVerdict = 'correct' | 'incomplete' | 'incorrect';

export interface TutorCorrection {
  issue: string;
  modelAnswer: string;
  attempt: number;
}

export interface ChatResult {
  reply: string;
  replyZh: string;
  verdict: TutorVerdict;
  round: number;
  question: string;
  sourceKind: 'textbook' | 'adapted';
  page: number;
  matchedPattern?: string;
  correction?: TutorCorrection;
  finished: boolean;
  action: 'advance' | 'retry_hint' | 'retry_model' | 'finish';
  errorType?: 'grammar' | 'word' | 'mismatch' | 'incomplete' | 'asr_empty' | 'unclear_transcript' | 'none';
  asrNote?: string;
  engine: 'builtin-doubao-workflow';
}

export interface TalkStartResult {
  scene: string;
  title: string;
  opening: string;
  openingZh: string;
  round: number;
  page: number;
  engine: 'builtin-doubao-workflow';
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/** 通用请求封装：转发给同源后端 */
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok || typeof (data as { error?: string }).error === 'string') {
    const err = (data as { error?: string; detail?: string }).error ?? '请求失败';
    throw new Error((data as { detail?: string }).detail || err);
  }
  return data;
}

/** 语音识别 ASR：接收音频 url 或 base64，返回识别文本 —— 真实后端 */
export async function recognizeSpeech(audio: { url?: string; base64?: string }): Promise<ASRResult> {
  const body: Record<string, unknown> = { uid: 'animal-buddy-user' };
  if (audio.url) body.url = audio.url;
  if (audio.base64) body.base64Data = audio.base64;
  return post<ASRResult>('/api/asr', body);
}

/** 语音合成 TTS：英文回复 → 可播放 mp3 URL —— 真实后端 */
export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  return post<TTSResult>('/api/tts', { uid: 'animal-buddy-user', text });
}

/** 开启/重置某场景：拿到 Rex 的教材脚本开场问题 —— 真实后端（不调模型，即时返回） */
export async function startTalkScene(scene: string, reset = true): Promise<TalkStartResult> {
  return post<TalkStartResult>('/api/talk/start', { uid: 'animal-buddy-user', scene, reset });
}

/** 内置教学智能体：学生文本/识别文本 → 工作流判定 + 三年级英文反馈 —— 真实后端 */
export async function askAgent(
  text: string,
  scene: string,
  history: HistoryItem[],
  reset = false,
): Promise<ChatResult> {
  return post<ChatResult>('/api/chat', { uid: 'animal-buddy-user', text, scene, history, reset });
}

/** 记录对话/纠错过程 —— 真实后端（对象存储持久化） */
export interface TalkRecordEntry {
  scene: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  expected?: string;
  correction?: string;
  /** 结构化错误类型（学习记录用） */
  errorType?: string;
  /** 当前轮（1 起） */
  round?: number;
  /** 引用教材页码 */
  page?: number;
  /** 本题累计提示次数（attempt） */
  attempt?: number;
  /** 本轮是否完成（finish） */
  finished?: boolean;
}

export async function recordTalk(entry: TalkRecordEntry): Promise<void> {
  await post<{ ok: boolean }>('/api/talk/record', { uid: 'animal-buddy-user', ...entry });
}

export interface UnitAudioItem {
  id: string;
  page: number;
  part: 'A' | 'B' | 'C';
  activity: string;
  fileName: string;
  storageKey: string;
  url: string | null;
  textVerified: 'verified' | 'pending';
  answerVerified: 'verified' | 'pending';
  matchStatus: string;
}

/** 教材原声清单（真实 MP3，对象存储 + 动态签名 URL）—— 真实后端 */
export async function fetchUnitAudioList(page?: number): Promise<UnitAudioItem[]> {
  const qs = page ? `?page=${page}` : '';
  const res = await fetch(`/api/audio${qs}`);
  const data = (await res.json()) as { items?: UnitAudioItem[]; error?: string };
  if (!res.ok || !Array.isArray(data.items)) {
    throw new Error(data.error || '获取教材原声清单失败');
  }
  return data.items;
}

/** 单段教材原声（按 U03_xx id）—— 真实后端，返回可播放 url */
export async function fetchUnitAudio(id: string): Promise<UnitAudioItem> {
  const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
  const data = (await res.json()) as UnitAudioItem & { error?: string };
  if (!res.ok || typeof data.url !== 'string') {
    throw new Error(data.error || '获取教材原声失败');
  }
  return data;
}