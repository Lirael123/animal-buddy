export type RouteName = 'home' | 'talk' | 'listen' | 'retry' | 'progress';

const routes: Record<string, RouteName> = {
  '': 'home',
  '#/': 'home',
  '#/talk': 'talk',
  '#/listen': 'listen',
  '#/retry': 'retry',
  '#/progress': 'progress',
};

export function parseHash(): RouteName {
  return routes[window.location.hash || ''] ?? 'home';
}

export function navigate(to: RouteName): void {
  window.location.hash = to === 'home' ? '#/' : `#/${to}`;
}

export function initRouter(render: (route: RouteName) => void): void {
  const onHashChange = (): void => {
    render(parseHash());
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}