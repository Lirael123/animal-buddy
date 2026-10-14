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
  errorType?: 'grammar' | 'missing_article' | 'word' | 'mismatch' | 'incomplete' | 'asr_empty' | 'unclear_transcript' | 'none';
  asrNote?: string;
  replySource?: 'model' | 'script';
  engine: 'builtin-doubao-workflow';
}

export interface TalkStartResult {
  scene: string;
  title: string;
  opening: string;
  openingZh: string;
  round: number;
  page: number;
  replySource?: 'model' | 'script';
  engine: 'builtin-doubao-workflow';
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

const pending = new Set<AbortController>();
let identityReady: Promise<unknown> | null = null;
let requestVersion = 0;
export function cancelApiRequests(): void {
  requestVersion++;
  for (const controller of pending) controller.abort();
  pending.clear();
}

/** The deadline includes response-body reading, not only receipt of headers. */
export async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const version = requestVersion;
  if (path !== '/api/session') {
    try { await (identityReady ??= request('/api/session')); }
    catch (error) { identityReady = null; throw error; }
  }
  if (version !== requestVersion) throw new DOMException('Page changed', 'AbortError');
  const controller = new AbortController();
  pending.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, { ...init, credentials: 'same-origin', signal: controller.signal });
    if (!res.headers.get('content-type')?.includes('application/json')) {
      throw new Error('接口未返回 JSON，请确认同时部署了 Express 后端');
    }
    const data: unknown = await res.json();
    const details = typeof data === 'object' && data !== null ? data as { error?: unknown; detail?: unknown } : {};
    if (!res.ok || typeof details.error === 'string') {
      throw new Error(typeof details.detail === 'string' ? details.detail : typeof details.error === 'string' ? details.error : `请求失败（${res.status}）`);
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒），请重试`);
    throw error;
  } finally {
    clearTimeout(timer);
    pending.delete(controller);
  }
}

async function post<T>(path: string, body: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
  return request<T>(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, timeoutMs);
}

export interface ServiceStatus {
  status: string;
  tutor: 'builtin';
  cloudConfigured: boolean;
  checked: false;
}
export function fetchServiceStatus(): Promise<ServiceStatus> { return request('/api/health'); }

/** 语音识别 ASR：接收音频 url 或 base64，返回识别文本 —— 真实后端 */
export async function recognizeSpeech(audio: { url?: string; base64?: string }): Promise<ASRResult> {
  const body: Record<string, unknown> = {};
  if (audio.url) body.url = audio.url;
  if (audio.base64) body.base64Data = audio.base64;
  return post<ASRResult>('/api/asr', body);
}

/** 语音合成 TTS：英文回复 → 可播放 mp3 URL —— 真实后端 */
export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  return post<TTSResult>('/api/tts', { text });
}

/** 开启/重置某场景：拿到 Rex 的教材脚本开场问题 —— 真实后端（不调模型，即时返回） */
export async function startTalkScene(scene: string, reset = true): Promise<TalkStartResult> {
  return post<TalkStartResult>('/api/talk/start', { scene, reset });
}

/** 内置教学智能体：学生文本/识别文本 → 工作流判定 + 三年级英文反馈 —— 真实后端 */
export async function askAgent(
  text: string,
  scene: string,
  history: HistoryItem[],
  reset = false,
): Promise<ChatResult> {
  return post<ChatResult>('/api/chat', { text, scene, history, reset });
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
  await post<{ ok: boolean }>('/api/talk/record', { ...entry }, 5000);
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
  const data = await request<{ items: UnitAudioItem[] }>(`/api/audio${qs}`);
  if (!Array.isArray(data.items)) throw new Error('教材原声清单格式错误');
  return data.items;
}

/** 单段教材原声（按 U03_xx id）—— 真实后端，返回可播放 url */
export async function fetchUnitAudio(id: string): Promise<UnitAudioItem> {
  const data = await request<UnitAudioItem>(`/api/audio/${encodeURIComponent(id)}`);
  if (typeof data.url !== 'string') throw new Error('教材原声暂不可用');
  return data;
}

// ===========================================================================
// 第三阶段 3A：正式听写 / 服务端评分 / 错题记录 / 学习进度
// ===========================================================================

export type DictationType = 'word' | 'sentence';
export type DictationSource = 'textbook' | 'adapted';
export type ScoreStatus =
  | 'correct' | 'grammar' | 'word' | 'missing_article' | 'unclear' | 'wrong';

export interface DictationItem {
  id: string;
  type: DictationType;
  page: number;
  section: string;
  category: string;
  difficulty: string;
  scorable: boolean;
  audioText: string;
  source: DictationSource;
  prompt: string;
}

export interface DictationListResult {
  engine: 'server-dictation';
  uid: string;
  count: number;
  items: DictationItem[];
}

export interface DictationScoreResult {
  engine: 'server-dictation';
  uid: string;
  counted: boolean;
  status: ScoreStatus;
  vocabOk: boolean;
  formOk: boolean;
  asrSkipped: boolean;
  hint: string;
  reference: string | null;
  correct: boolean;
}

export interface DictationAudioResult {
  engine: 'textbook-mp3' | 'tts';
  id: string;
  url: string;
  source: 'textbook' | 'tts';
  word?: string;
}

export interface DictationRecordItem {
  key: string;
  time: string;
  createdAt: string;
  uid: string;
  qid: string;
  page: number;
  type: DictationType;
  session: string;
  firstAnswer: string;
  retries: string[];
  errorType: string | null;
  aiHintCount: number;
  corrected: boolean;
  firstCorrect: number;
  mastered: boolean;
  vocabOk: boolean;
  formOk: boolean;
  asrSkipped: boolean;
}

export interface ProgressSummary {
  engine: 'server-dictation';
  uid: string;
  exercised: number;
  masteredVocab: number;
  firstPassRate: number;
  correctionCount: number;
  pending: string[];
  reviewRecommend: string[];
}

/** 获取可练习听写题目（服务端题库，不含标准答案） */
export async function fetchDictationList(type?: DictationType | ''): Promise<DictationListResult> {
  return post<DictationListResult>('/api/dictation/list', { type: type || undefined });
}

/** 提交一题听写，服务端固定评分 + 幂等落库 + 返回反馈 */
export async function submitDictation(
  qid: string,
  answer: string,
  opts: { session: string; isAsr?: boolean; isRetry?: boolean },
): Promise<DictationScoreResult> {
  return post<DictationScoreResult>('/api/dictation/submit', {
    qid,
    answer,
    session: opts.session,
    isAsr: opts.isAsr,
    isRetry: opts.isRetry,
  });
}

/** 获取某题的播放语音（教材原声或 TTS 合成，标注来源） */
export async function fetchDictationAudio(qid: string): Promise<DictationAudioResult> {
  return post<DictationAudioResult>('/api/dictation/audio', { qid });
}

/** 获取自己的错题记录（服务端按 uid 过滤） */
export async function fetchDictationRecords(): Promise<DictationRecordItem[]> {
  const data = await request<{ items: DictationRecordItem[] }>('/api/dictation/records');
  if (!Array.isArray(data.items)) throw new Error('错题记录格式错误');
  return data.items;
}

/** 获取学习进度（仅本人可读，服务端校验） */
export async function fetchProgress(): Promise<ProgressSummary> {
  return request<ProgressSummary>('/api/progress');
}
