import { Router } from 'express';
import {
  Config,
  HeaderUtils,
  ASRClient,
  TTSClient,
  LLMClient,
  S3Storage,
} from 'coze-coding-dev-sdk';

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

const SCENE_CONTEXT: Record<string, string> = {
  'my-pet': `Unit 3 Our animal friends · My Pet · P28 part.
教材核心句:
- Do you have a pet? - Yes, I do. I have a dog.
- What is your pet like? - It is cute and friendly.
- This is my pet. It has two long ears and a short tail.
你是儿童英语口语外教 Rex，面对小学三年级学生。要求：
- 只用英语回复，句子要短、简单、友善，一次不超过 2 句。
- 围绕 "Do you have a pet?"、"What is your pet like?" 引导学生开口说。
- 学生发音/语法不完整时，先正面鼓励（Great/Well done），再示范正确句子让学生重复。
- 不输出翻译，不输出学习无关内容。`,
  'at-the-zoo': `Unit 3 Our animal friends · At the Zoo · P30 part.
教材核心句:
- What is that animal? - It is a giraffe. It is tall.
- What does it look like? - It has a long neck and long legs.
- The elephant has big ears and a long nose.
你是儿童英语口语外教 Rex，面对小学三年级学生。要求：只用英语、句子简短友善、围绕动物园动物提问互动，鼓励学生开口。`,
};

/**
 * 3. LLM / Agent 英语回复：学生语音识别文本 → 教材外教回复
 */
router.post('/api/chat', async (req, res) => {
  try {
    const { text, scene, history } = req.body as {
      text?: string;
      scene?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'missing text' });
    }
    const uid = uidOf(req);
    const context = SCENE_CONTEXT[scene ?? 'my-pet'] ?? SCENE_CONTEXT['my-pet'];
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: context },
    ];
    if (Array.isArray(history)) {
      messages.push(...history.slice(-8));
    }
    messages.push({ role: 'user', content: text });

    const client = new LLMClient(new Config(), forward(req));
    const resp = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.6,
    });
    res.json({ reply: resp.content });
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