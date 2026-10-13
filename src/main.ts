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
  };

  initRouter(render);
}