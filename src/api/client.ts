/**
 * Animal Buddy 后端能力接口层。
 *
 * ⚠️ 重要状态说明
 * ------------------------------------------------
 * 现有 Animal Buddy Agent 已包含：教材知识库、教材录音、
 * ASR（语音识别）、TTS（语音合成）、学习记录。
 *
 * 但在本次「网页预览」阶段，这些后端能力**尚未联通**。
 * 本文件为唯一接口出口，仅预留函数签名与请求构造逻辑，
 * 用于将来对接 Agent API；未经后端真实联调前均标记为
 * 「待接入」，UI 也不会伪造返回成功的假数据。
 * ------------------------------------------------
 */

export interface AppConfig {
  /** Agent 服务基础地址，来自运行时环境变量 */
  baseUrl: string;
  /** Agent 的 Bot ID 或工作流 ID，待配置 */
  agentId: string;
}

interface ImportMetaEnv {
  COZE_AGENT_BASE_URL?: string;
  COZE_AGENT_ID?: string;
}

/** 从构建期环境变量读取 Agent 配置；缺省时返回空配置表示未接入 */
export function getAgentConfig(): AppConfig {
  const env = (import.meta as unknown as { env?: ImportMetaEnv }).env ?? {};
  return {
    baseUrl: env.COZE_AGENT_BASE_URL ?? '',
    agentId: env.COZE_AGENT_ID ?? '',
  };
}

/** 判断 Agent 是否已配置可调用 */
export function isAgentConnected(): boolean {
  const cfg = getAgentConfig();
  return Boolean(cfg.baseUrl && cfg.agentId);
}

export interface TalkLine {
  speaker: 'brother' | 'buddy';
  en: string;
  zh: string;
}

/** 单个场景的对话内容（当前为静态演示数据，最终由教材知识库下发） */
export interface SceneContent {
  id: string;
  title: string;
  lines: TalkLine[];
}

/** 教材原声：待接入（返回绝对 URL 或音频 base64） */
export async function fetchTextbookAudio(sceneId: string): Promise<string> {
  void sceneId;
  throw new Error(
    `[待接入] 教材原声接口尚未联通，无法返回音频资源（sceneId=${sceneId}）。`,
  );
}

/** 语音识别 ASR：接收音频，返回识别文本 —— 待接入 */
export async function recognizeSpeech(audio: Blob): Promise<string> {
  void audio;
  throw new Error('[待接入] ASR 语音识别接口尚未联通，无法识别语音。');
}

/** 语音合成 TTS：接收文本，返回音频 Blob —— 待接入 */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  void text;
  throw new Error('[待接入] TTS 语音合成接口尚未联通，无法合成语音。');
}

/** 教材知识库：按场景查询对话内容 —— 待接入 */
export async function fetchScene(sceneId: string): Promise<SceneContent | null> {
  void sceneId;
  throw new Error('[待接入] 教材知识库接口尚未联通，无法获取对话内容。');
}

/** 学习记录：上报一次练习结果 —— 待接入 */
export async function saveProgress(
  sceneId: string,
  correct: boolean,
): Promise<void> {
  void sceneId;
  void correct;
  throw new Error('[待接入] 学习记录接口尚未联通，无法保存进度。');
}