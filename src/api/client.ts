/**
 * Animal Buddy 后端能力接口层。
 *
 * 状态说明（真实联通情况）：
 * --------------------------------------------------
 * ✅ 已真实接入（本云项目平台集成，后端 Express 路由 + coze-coding-dev-sdk）：
 *    - /api/asr   语音识别（英文）
 *    - /api/tts   语音合成（英文回复 → 可播放 mp3 URL）
 *    - /api/chat  Agent 回复（doubao 大模型，教材场景引导）
 *    - /api/talk/record  对话与纠错过程持久化（对象存储 JSON）
 *
 * ❌ 仍待接入（资源在本项目暂不可达，不伪造连接）：
 *    - 教材原声音频（Unit 3 的 MP3）——对象存储中不存在该资源
 *    - Unit 3 教材知识库       ——本项目知识库/数据库中无教材数据
 *    - 原 Agent 项目公共 API   ——localhost:9000/9001 不可跨项目访问
 *    - 学习记录聚合看板        ——数据库无业务表
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
export interface ChatResult {
  reply: string;
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

/** Agent 回复：学生文本 / 识别文本 → 教材外教英文回复 —— 真实后端 */
export async function askAgent(
  text: string,
  scene: string,
  history: HistoryItem[],
): Promise<ChatResult> {
  return post<ChatResult>('/api/chat', { uid: 'animal-buddy-user', text, scene, history });
}

/** 记录对话/纠错过程 —— 真实后端（对象存储持久化） */
export async function recordTalk(entry: {
  scene: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  expected?: string;
  correction?: string;
}): Promise<void> {
  await post<{ ok: boolean }>('/api/talk/record', { uid: 'animal-buddy-user', ...entry });
}

/**
 * 教材原声：待接入。
 * 现有 Unit 3 教材音频（MP3）在本云端对象存储中不存在，且原 Agent 项目的
 * localhost:9000/9001 不可作为公共地址访问，因此此处不返回任何伪造音频。
 */
export async function fetchTextbookAudio(sceneId: string): Promise<string> {
  void sceneId;
  throw new Error(
    '[待接入] 教材原声音频资源在当前项目中不可用：对象存储中未发现 Unit 3 教材 MP3，需提供该资源的访问授权/地址后接入。',
  );
}