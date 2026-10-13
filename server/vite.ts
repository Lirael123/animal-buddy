// ABOUTME: Vite integration for Express server
// ABOUTME: Handles dev middleware and production static file serving

import type { Application, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../vite.config';

const isDev = process.env.COZE_PROJECT_ENV !== 'PROD';

/**
 * 集成 Vite 开发服务器（中间件模式）
 */
export async function setupViteMiddleware(app: Application) {
  const vite = await createViteServer({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      middlewareMode: true,
    },
    appType: 'spa',
  });

  // API 未命中守卫：必须在 vite.middlewares 之前注册。
  // 能到达这里的 /api/* 请求，说明更前面注册的后端 API 路由（router）均未匹配
  //（路径错误 / 方法不对 / 接口尚未注册）。Vite 的 SPA fallback（appType:'spa'）
  // 会把未命中请求直接改写成 index.html 且不放行，因此在进入 Vite 前先拦截，
  // 返回 404 JSON，避免 API 请求拿到 200 HTML。
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'api_not_found',
      message: `No API route matches ${req.method} ${req.originalUrl}`,
    });
  });

  // 使用 Vite middleware
  app.use(vite.middlewares);

  console.log('🚀 Vite dev server initialized');
}

/**
 * 设置生产环境静态文件服务
 */
export function setupStaticServer(app: Application) {
  const distPath = path.resolve(process.cwd(), 'dist');

  if (!fs.existsSync(distPath)) {
    console.error('❌ dist folder not found. Please run "pnpm build" first.');
    process.exit(1);
  }

  // 1. 服务静态文件（如果存在对应文件则直接返回）
  app.use(express.static(distPath));

  // 2. API 未命中守卫：任何未被后端路由处理的 /api/* 一律返回 404 JSON，
  //    绝不穿透到下面的 SPA fallback 返回 index.html（避免拿到 200 HTML 掩盖错误）。
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'api_not_found',
      message: `No API route matches ${req.method} ${req.originalUrl}`,
    });
  });

  // 3. SPA fallback - 所有未处理的非 API 请求返回 index.html
  // 到达这里的请求说明：
  //   - 不是 API 请求（API 未命中已被上面的守卫拦截为 404 JSON）
  //   - 不是静态文件（express.static 未找到对应文件）
  //   - 需要返回 index.html 让前端路由处理
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log('📦 Serving static files from dist/');
}

/**
 * 根据环境设置 Vite
 */
export async function setupVite(app: Application) {
  if (isDev) {
    await setupViteMiddleware(app);
  } else {
    setupStaticServer(app);
  }
}
