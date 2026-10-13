import { initRouter, type RouteName } from './pages/router';
import { renderHome, bindHome } from './pages/home';
import { renderTalk, bindTalk } from './pages/talk';

export function initApp(): void {
  const app = document.getElementById('app');

  if (!app) {
    console.error('App element not found');
    return;
  }

  const render = (route: RouteName): void => {
    if (route === 'talk') {
      app.innerHTML = renderTalk();
      bindTalk(app);
    } else {
      app.innerHTML = renderHome();
      bindHome(app);
    }
  };

  initRouter(render);
}