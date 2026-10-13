import { initRouter, type RouteName } from './pages/router';
import { renderHome, bindHome } from './pages/home';
import { renderTalk, bindTalk } from './pages/talk';
import { renderListen, bindListen } from './pages/listen';
import { renderRetry, bindRetry } from './pages/retry';
import { renderProgress, bindProgress } from './pages/progress';

export function initApp(): void {
  const app = document.getElementById('app');

  if (!app) {
    console.error('App element not found');
    return;
  }

  const render = (route: RouteName): void => {
    // 切换页面前停止可能正在播放的浏览器示例朗读
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // 每次渲染加错误边界：某页面渲染/绑定抛错时给出明确提示，避免页面静默停留在旧内容
    try {
      switch (route) {
        case 'talk':
          app.innerHTML = renderTalk();
          bindTalk(app);
          break;
        case 'listen':
          app.innerHTML = renderListen();
          bindListen(app);
          break;
        case 'retry':
          app.innerHTML = renderRetry();
          bindRetry(app);
          break;
        case 'progress':
          app.innerHTML = renderProgress();
          bindProgress(app);
          break;
        default:
          app.innerHTML = renderHome();
          bindHome(app);
      }
    } catch (err) {
      console.error('[Animal Buddy] 页面渲染失败:', err, 'route=', route);
      const msg = err instanceof Error ? err.message : String(err);
      app.innerHTML = `
        <div class="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
          <p class="text-5xl">😵</p>
          <p class="text-2xl font-extrabold text-ink">这一页出了点小问题</p>
          <p class="max-w-md text-base font-semibold text-ink/60">${msg}</p>
          <a href="#/" class="pressable mt-2 rounded-2xl bg-grass px-6 py-3 text-lg font-extrabold text-white">返回首页</a>
        </div>`;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  initRouter(render);
}