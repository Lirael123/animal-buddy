import { Router } from 'express';
import voiceRouter from './voice';
import { Config } from 'coze-coding-dev-sdk';
import { studentUid } from '../identity';

const router = Router();
router.get('/api/session', (req, res) => res.json({ uid: studentUid(req) }));

// 真实语音交互链路：ASR / TTS / LLM(Agent) / 对话记录
router.use(voiceRouter);

// API 路由示例
router.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from Express + Vite!',
    timestamp: new Date().toISOString(),
  });
});

router.post('/api/data', (req, res) => {
  const requestData = req.body;
  res.json({
    success: true,
    data: requestData,
    receivedAt: new Date().toISOString(),
  });
});

// 健康检查接口
router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    tutor: 'builtin',
    cloudConfigured: Boolean(new Config().apiKey),
    checked: false,
    env: process.env.COZE_PROJECT_ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * API 未命中守卫（必须放在所有 API 路由之后、SPA fallback 之前）。
 * 能走到这里的 /api/* 请求，说明没有任何后端路由匹配：
 *   - 路径拼写错误
 *   - HTTP 方法不对（如对仅注册 POST 的接口发起 GET）
 *   - 版本落后导致接口尚未注册
 * 一律返回 404 JSON，绝不让它穿透到 SPA fallback 返回 index.html，
 * 避免「API 请求拿到 200 HTML」掩盖真实错误。
 */
router.use('/api', (req, res) => {
  res.status(404).json({
    error: 'api_not_found',
    message: `No API route matches ${req.method} ${req.originalUrl}`,
  });
});

export default router;
