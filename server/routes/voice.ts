import { Router } from 'express';
import { Config, HeaderUtils, ASRClient, TTSClient, S3Storage } from 'coze-coding-dev-sdk';
import { runAgentStream } from '../agentClient';

const router = Router();

// 从入站请求转发鉴权/追踪头（SDK 要求）
function forward(req: import('express').Request): Record<string, string> {
  return HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
}

function uidOf(req: import('express').Request): string {
  const fromQuery = String(req.query.uid ?? '');
  const fromBody = String((req.body as { uid?: string })?.uid ?? '');
  return fromQuery || fromBody || 'animal-buddy-user';
}

/**
 * 1. ASR 语音识别：学生录音 true 识别为英文文本
 *    支持 url 或 base64Data（浏览器 WebAudio 转 wav → base64）
 */
router.post('/api/asr', async (req, res) => {
  try {
    const { url, base64Data } = req.body as { url?: string; base64Data?: string };
    if (!url && !base64Data) {
      return res.status(400).json({ error: 'missing audio url or base64Data' });
    }
    const uid = uidOf(req);
    const client = new ASRClient(new Config(), forward(req));
    const result = await client.recognize({ uid, url, base64Data });
    res.json({ text: result.text, duration: result.duration ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[asr] failed:', msg);
    res.status(502).json({ error: 'ASR failed', detail: msg });
  }
});

/**
 * 2. TTS 语音合成：Agent 英文回复 → 可播放音频 URL
 */
router.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'missing text' });
    }
    const uid = uidOf(req);
    const client = new TTSClient(new Config(), forward(req));
    const resp = await client.synthesize({
      uid,
      text,
      speaker: 'zh_female_vv_uranus_bigtts',
      audioFormat: 'mp3',
    });
    res.json({ audioUri: resp.audioUri, audioSize: resp.audioSize });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[tts] failed:', msg);
    res.status(502).json({ error: 'TTS failed', detail: msg });
  }
});

/**
 * 3. 教学 Agent：学生语音识别文本 → 原 Animal Buddy 智能体（跨项目 /stream_run）
 *
 * - 不再直接调用独立豆包模型；教学回复统一由原智能体产出。
 * - 同一学生(uid)+场景保持同一 session_id，不同学生会话隔离。
 * - 仅 Service 端持有 Token（ANIMAL_BUDDY_AGENT_TOKEN），前端不可见。
 */
// 会话隔离：uid -> scene -> session_id
const sessionStore = new Map<string, Map<string, string>>();

function getSessionId(uid: string, scene: string): string {
  const byScene = sessionStore.get(uid) ?? new Map<string, string>();
  if (!sessionStore.has(uid)) sessionStore.set(uid, byScene);
  let sid = byScene.get(scene);
  if (!sid) {
    // 新会话：用 uid + scene + 时间戳生成（不下发 token，仅作会话 key）
    sid = `${uid.replace(/[^a-zA-Z0-9_-]/g, '')}-${scene}-${Date.now()}`;
    byScene.set(scene, sid);
  }
  return sid;
}

router.post('/api/chat', async (req, res) => {
  try {
    const { text, scene } = req.body as {
      text?: string;
      scene?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'missing text' });
    }
    const uid = uidOf(req);
    const sceneKey = scene ?? 'my-pet';
    const sessionId = getSessionId(uid, sceneKey);

    const result = await runAgentStream(req, {
      uid,
      scene: sceneKey,
      prompt: text.trim(),
      sessionId,
    });

    if (!result.success) {
      // 真实失败（鉴权/参数/超时/知识库未命中等）：如实返回错误，不回退豆包。
      console.error(`[agent] ${result.detail} uid=${uid} scene=${sceneKey}`);
      return res.status(502).json({
        error: 'Animal Buddy Agent 调用失败',
        detail: result.detail,
        agentConfigured: false,
      });
    }

    // 记录会话 id 到 store（原样返回），便于连续对话复用
    const byScene = sessionStore.get(uid)!;
    byScene.set(sceneKey, result.sessionId || sessionId);

    res.json({ reply: result.reply, sessionId: result.sessionId || sessionId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[chat] failed:', msg);
    res.status(502).json({ error: 'Agent reply failed', detail: msg });
  }
});

/**
 * 4. 对话记录（含纠错过程）持久化到对象存储 JSONL
 *    每行一条 { time, uid, scene, role, text, expected? , correction? }
 */
router.post('/api/talk/record', async (req, res) => {
  try {
    const { scene, role, text, expected, correction } = req.body as {
      scene?: string;
      role?: 'user' | 'assistant' | 'system';
      text?: string;
      expected?: string;
      correction?: string;
    };
    if (!text || !role) {
      return res.status(400).json({ error: 'missing text or role' });
    }
    const uid = uidOf(req);
    const record = {
      time: new Date().toISOString(),
      uid,
      scene: scene ?? 'my-pet',
      role,
      text,
      expected: expected ?? null,
      correction: correction ?? null,
    };
    const storage = new S3Storage({});
    const storedKey = await storage.uploadFile({
      fileContent: Buffer.from(JSON.stringify(record)),
      fileName: `talk/records/${uid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}.json`,
      contentType: 'application/json',
    });
    res.json({ ok: true, key: storedKey });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[talk/record] failed:', msg);
    res.status(500).json({ error: 'record failed', detail: msg });
  }
});

export default router;