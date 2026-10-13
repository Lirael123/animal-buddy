import { Router } from 'express';
import { Config, HeaderUtils, ASRClient, TTSClient, S3Storage } from 'coze-coding-dev-sdk';
import { runTutorTurn, startScene } from '../tutor/workflow';
import { UNIT_AUDIO, getUnitAudio } from '../tutor/audio';

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
 * 3. 内置教学智能体（Animal Buddy Tutor）
 *
 * 架构（已取消跨项目 /stream_run 方案，不再依赖 ANIMAL_BUDDY_AGENT_TOKEN）：
 *   服务端教学工作流(server/tutor/workflow.ts)
 *     ├─ 本地结构化教材知识(curriculum.ts，Unit 3 P28-29，非平台 RAG)
 *     ├─ 确定性答案判定 / 轮次推进 / has→have 纠错
 *     └─ 豆包 LLM：仅把教学意图润色成三年级水平的一句英文反馈
 *
 * 同一学生(uid)+场景在服务端维持会话状态机，不同学生相互隔离。
 */

/** 开启/重置某场景：返回 Rex 的开场问题（教材脚本第一问） */
router.post('/api/talk/start', (req, res) => {
  try {
    const { scene, reset } = req.body as { scene?: string; reset?: boolean };
    const uid = uidOf(req);
    const sceneKey = scene ?? 'my-pet';
    void reset; // startScene 本身会重建会话
    const opened = startScene(uid, sceneKey);
    res.json({
      scene: opened.scene.key,
      title: opened.scene.title,
      opening: opened.opening,
      openingZh: opened.openingZh,
      round: opened.round,
      page: opened.page,
      engine: 'builtin-doubao-workflow',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[talk/start] failed:', msg);
    res.status(500).json({ error: 'start failed', detail: msg });
  }
});

/** 学生一轮回答（语音 ASR 文本或键盘文本）→ 工作流判定 + 豆包反馈 */
router.post('/api/chat', async (req, res) => {
  try {
    const { text, scene, reset, history } = req.body as {
      text?: string;
      scene?: string;
      reset?: boolean;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'missing text' });
    }
    const uid = uidOf(req);
    const sceneKey = scene ?? 'my-pet';

    const feedback = await runTutorTurn(req, {
      uid,
      scene: sceneKey,
      text: text.trim(),
      reset: Boolean(reset),
      history: Array.isArray(history) ? history : [],
    });

    res.json(feedback);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[chat] failed:', msg);
    res.status(502).json({ error: '内置教学智能体回复失败', detail: msg });
  }
});

/**
 * 4. 对话记录（含纠错过程）持久化到对象存储 JSONL
 *    每行一条 { time, uid, scene, role, text, expected? , correction? }
 */
router.post('/api/talk/record', async (req, res) => {
  try {
    const { scene, role, text, expected, correction, errorType, round, page, attempt, finished } = req.body as {
      scene?: string;
      role?: 'user' | 'assistant' | 'system';
      text?: string;
      expected?: string;
      correction?: string;
      errorType?: string;
      round?: number;
      page?: number;
      attempt?: number;
      finished?: boolean;
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
      errorType: errorType ?? null,
      round: round ?? null,
      page: page ?? null,
      attempt: attempt ?? null,
      finished: finished ?? null,
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

/**
 * 5. 教材原声（Unit 3，真实对象存储 MP3，非 TTS）
 *
 * - GET /api/audio            → 全量清单（元信息 + 动态可播 URL）
 * - GET /api/audio/:id        → 单段教材原声（U03_xx）
 * - GET /api/audio?page=28    → 按页码取该页教材原声
 *
 * 播放链接由 generatePresignedUrl 动态生成（短期），前端必须直接播放返回的可播 URL。
 * 文本/答案逐字核验状态沿用 assets/说明文档.md：未完成的一律标 pending，不得编造。
 */
router.get('/api/audio', async (req, res) => {
  try {
    const page = Number((req.query as { page?: string }).page ?? NaN);
    const source = Number.isInteger(page) && page > 0 ? UNIT_AUDIO.filter((a) => a.page === page) : UNIT_AUDIO;

    const storage = new S3Storage({});
    const signed = [];
    for (const a of source) {
      let url: string | null = null;
      try {
        url = await storage.generatePresignedUrl({ key: a.storageKey, expireTime: 3600 });
      } catch {
        url = null;
      }
      signed.push({
        id: a.id,
        page: a.page,
        part: a.part,
        activity: a.activity,
        fileName: a.fileName,
        storageKey: a.storageKey,
        url,
        textVerified: a.textVerified,
        answerVerified: a.answerVerified,
        matchStatus: a.matchStatus,
      });
    }
    res.json({ engine: 'object-storage', count: signed.length, items: signed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[audio] list failed:', msg);
    res.status(502).json({ error: 'audio list failed', detail: msg });
  }
});

router.get('/api/audio/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const audio = getUnitAudio(id);
    if (!audio) {
      return res.status(404).json({ error: `no such audio ${id}` });
    }
    const storage = new S3Storage({});
    const url = await storage.generatePresignedUrl({ key: audio.storageKey, expireTime: 3600 });
    res.json({
      id: audio.id,
      page: audio.page,
      part: audio.part,
      activity: audio.activity,
      fileName: audio.fileName,
      storageKey: audio.storageKey,
      url,
      textVerified: audio.textVerified,
      answerVerified: audio.answerVerified,
      matchStatus: audio.matchStatus,
      engine: 'object-storage',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[audio] get failed:', msg);
    res.status(502).json({ error: 'audio get failed', detail: msg });
  }
});

export default router;