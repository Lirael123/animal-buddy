import { Router } from 'express';
import { Config, HeaderUtils, ASRClient, TTSClient, S3Storage } from 'coze-coding-dev-sdk';
import { runTutorTurn, startScene } from '../tutor/workflow';
import { UNIT_AUDIO, getUnitAudio } from '../tutor/audio';
import { pickDictationPool, getDictationItem, toPublic, scoreDictation } from '../tutor/dictation';
import { recordSubmission, listAttempts, aggregateProgress } from '../tutor/records';

const router = Router();

// 从入站请求转发鉴权/追踪头（SDK 要求）
function forward(req: import('express').Request): Record<string, string> {
  return HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
}

function uidOf(req: import('express').Request): string {
  const fromQuery = String(req.query.uid ?? '');
  const fromBody = String((req.body as { uid?: string })?.uid ?? '');
  return fromQuery || fromBody || '';
}

/**
 * 校验是否为「合法虚拟学生」身份。
 * 开发/展示阶段只允许 3−32 位字母数字（- _ .），不得收集真实姓名等个人信息；
 * 匿名/非法 uid 一律拒绝，避免未授权读写（服务端侧兜底，不依赖前端）。
 */
const UID_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
function requireUid(req: import('express').Request): string | null {
  const uid = uidOf(req);
  if (!uid || !UID_RE.test(uid)) return null;
  return uid;
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

/**
 * ===================================================================
 * 第三阶段 3A：正式听写练习 / 服务端固定评分 / 错题记录 / 学习进度
 * ===================================================================
 * 说明：
 * - 标准答案库【不下发浏览器】，仅评分发生在服务端；
 * - 记录按 uid 落地对象存储并做服务端 uid 核验，杜绝越权读取/写入；
 * - P34 circle、未核验项均不可评分（题目 scorable=false，仅展示）。
 */

/** POST /api/dictation/list —— 获取可练习题目清单（不含标准答案） */
router.post('/api/dictation/list', (req, res) => {
  try {
    const uid = requireUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'invalid or missing uid (require virtual student id)' });
    }
    const { type } = req.body as { type?: string };
    const pool = pickDictationPool(type);
    const items = pool.map((i) => toPublic(i));
    res.json({ engine: 'server-dictation', uid, count: items.length, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'dictation list failed', detail: msg });
  }
});

/** POST /api/dictation/submit —— 学生提交一题，服务端评分 + 幂等入账 + 写错题记录 */
router.post('/api/dictation/submit', async (req, res) => {
  try {
    const uid = requireUid(req);
    if (!uid) {
      return res.status(401).json({ error: 'invalid or missing uid' });
    }
    const { qid, answer, session, isAsr, isRetry } = req.body as {
      qid?: string;
      answer?: string;
      session?: string;
      isAsr?: boolean;
      isRetry?: boolean;
    };
    const item = qid ? getDictationItem(String(qid)) : undefined;
    if (!item) return res.status(404).json({ error: `no such dictation ${qid}` });
    if (!item.scorable) {
      return res.status(400).json({ error: '这是尚未核验/不可自动评分的题目，不能提交评分' });
    }
    const ans = String(answer ?? '').trim();
    if (!ans) return res.status(400).json({ error: 'missing answer' });

    const score = scoreDictation(ans, item, !!isAsr);

    // 幂等落库：同一 uid+qid+session 的一轮练习只计一次成绩；
    // 重练/重复提交/刷新（沿用同一 session）合并更新同一条记录，不重复累计。
    const { counted } = await recordSubmission({
      uid,
      qid: item.id,
      page: item.page,
      type: item.type,
      session: String(session ?? ''),
      answer: ans,
      isRetry: !!isRetry,
      errorType: score.status,
      vocabOk: score.vocabOk,
      formOk: score.formOk,
      asrSkipped: score.asrSkipped,
      isCorrect: score.status === 'correct',
    });

    res.json({
      engine: 'server-dictation',
      uid,
      counted,
      status: score.status,
      vocabOk: score.vocabOk,
      formOk: score.formOk,
      asrSkipped: score.asrSkipped,
      hint: score.hint,
      reference: score.status === 'correct' ? null : score.reference,
      correct: score.status === 'correct',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dictation/submit] failed:', msg);
    res.status(500).json({ error: 'dictation submit failed', detail: msg });
  }
});

/** POST /api/dictation/audio —— 获取某题的播放语音（教材原句走原声，其余为 TTS 合成标注） */
router.post('/api/dictation/audio', async (req, res) => {
  try {
    const uid = requireUid(req);
    if (!uid) return res.status(401).json({ error: 'invalid or missing uid' });
    const { qid } = req.body as { qid?: string };
    const item = qid ? getDictationItem(String(qid)) : undefined;
    if (!item) return res.status(404).json({ error: `no such dictation ${qid}` });

    if (item.source === 'textbook') {
      // 教材句子：优先匹配对应原声；无原声则回落 TTS 并如实标注
      const id = mapSentenceAudio(item.id);
      const audio = id ? getUnitAudio(id) : undefined;
      const storage = new S3Storage({});
      if (audio) {
        const url = await storage.generatePresignedUrl({ key: audio.storageKey, expireTime: 3600 });
        return res.json({ engine: 'textbook-mp3', id: audio.id, url, source: 'textbook' });
      }
    }

    // 教学改编 / 单词：TTS 合成语音，明确标注为 AI 合成（与教材原声区分）
    const client = new TTSClient(new Config(), forward(req));
    const resp = await client.synthesize({
      uid,
      text: item.audioText,
      speaker: 'zh_female_vv_uranus_bigtts',
      audioFormat: 'mp3',
    });
    res.json({ engine: 'tts', id: item.id, url: resp.audioUri, source: 'tts', word: item.audioText });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dictation/audio] failed:', msg);
    res.status(502).json({ error: 'dictation audio failed', detail: msg });
  }
});

/** GET /api/dictation/records —— 学生自己的错题记录（服务端 uid 过滤） */
router.get('/api/dictation/records', async (req, res) => {
  try {
    const uid = requireUid(req);
    if (!uid) return res.status(401).json({ error: 'invalid or missing uid' });
    const attempts = await listAttempts(uid); // 内部已按 uid 过滤
    // 只回传“错过的题”（含最终未掌握），不含首次就全对的重复条目
    const mistakes = attempts.filter((a) => !a.asrSkipped && !a.mastered);
    res.json({ engine: 'server-dictation', uid, count: mistakes.length, items: mistakes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'dictation records failed', detail: msg });
  }
});

/** GET /api/progress —— 学生学习进度（仅本人可读） */
router.get('/api/progress', async (req, res) => {
  try {
    const uid = requireUid(req);
    if (!uid) return res.status(401).json({ error: 'invalid or missing uid' });
    const attempts = await listAttempts(uid);
    const progress = aggregateProgress(uid, attempts);
    res.json({ engine: 'server-dictation', ...progress });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'progress failed', detail: msg });
  }
});

/** U3 教材句子 → 对应原声 ID（已核验可回放；未核验的返回空走 TTS） */
function mapSentenceAudio(qid: string): string | null {
  const map: Record<string, string> = {
    'U3-029': 'U03_01',
    'U3-030': 'U03_02',
    'U3-031': 'U03_03',
    'U3-032': 'U03_04',
    'U3-033': 'U03_05',
    'U3-041': 'U03_07',
    'U3-042': 'U03_08',
    'U3-043': 'U03_09',
    'U3-044': 'U03_10',
  };
  return map[qid] ?? null;
}

export default router;