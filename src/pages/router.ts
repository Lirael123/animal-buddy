export type RouteName = 'home' | 'talk';

const routes: Record<string, RouteName> = {
  '': 'home',
  '#/': 'home',
  '#/talk': 'talk',
};

export function parseHash(): RouteName {
  const hash = window.location.hash || '';
  return routes[hash] ?? 'home';
}

export function navigate(to: RouteName): void {
  const target = to === 'home' ? '#/' : `#/${to}`;
  window.location.hash = target;
}

/** 注册一个最小哈希路由：解析 hash 变化后调用渲染函数 */
export function initRouter(render: (route: RouteName) => void): void {
  const onHashChange = (): void => {
    render(parseHash());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}