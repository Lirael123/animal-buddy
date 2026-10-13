import { ASSETS } from '../assets';
import { pendingBadge } from './ui';

interface TopBarOpts {
  emoji: string;
  emojiBg: string; // tailwind bg for icon square
  title: string;
  subtitle: string;
}

/** 内页通用薄荷绿顶栏 */
export function topBar({ emoji, emojiBg, title, subtitle }: TopBarOpts): string {
  return `
  <header class="relative z-20 flex items-center justify-between gap-3 bg-gradient-to-r from-mint-soft via-mint-light to-grass-soft px-4 py-3 sm:px-6">
    <button data-back class="pressable flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-ink shadow-sm">
      <span class="text-lg leading-none">🏠</span><span>返回首页</span>
    </button>

    <div class="flex items-center gap-2.5">
      <span class="grid h-11 w-11 place-items-center rounded-2xl ${emojiBg} text-2xl shadow-sm">${emoji}</span>
      <h1 class="flex items-baseline gap-2">
        <span class="text-2xl font-extrabold text-ink sm:text-3xl">${title}</span>
        <span class="hidden text-lg font-bold text-ink/55 sm:inline">${subtitle}</span>
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <span class="hidden rounded-full bg-grass px-3.5 py-1.5 text-base font-extrabold text-white shadow-sm sm:inline">Unit 3</span>
      <button data-history class="pressable grid h-10 w-10 place-items-center rounded-2xl bg-yellow-300 text-xl shadow-sm">🏠</button>
      <button data-avatar class="pressable h-10 w-10 overflow-hidden rounded-full ring-2 ring-white shadow-sm">
        <img src="${ASSETS.bunnyHero}" alt="Rex" class="h-full w-full object-cover" loading="lazy" />
      </button>
    </div>
  </header>`;
}

export interface SideItem {
  key: string;
  emoji: string;
  title: string;
  sub: string;
}

/** 内页左侧竖向菜单（选中项奶油黄底+橙描边） */
export function sideMenu(items: SideItem[], active: string): string {
  return `
  <aside class="flex shrink-0 gap-2 overflow-x-auto pb-1 sm:w-56 sm:flex-col sm:overflow-visible sm:pb-0">
    ${items
      .map(
        it => `
      <button data-side="${it.key}" class="pressable flex min-w-[150px] items-center gap-3 rounded-3xl px-4 py-3.5 text-left shadow-sm sm:min-w-0 ${
        it.key === active
          ? 'bg-cream-deep ring-2 ring-orange'
          : 'bg-white/70 ring-1 ring-grass-soft/50 hover:bg-white'
      }">
        <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-pale text-2xl">${it.emoji}</span>
        <span>
          <span class="block text-lg font-extrabold leading-5 text-ink">${it.title}</span>
          <span class="block text-sm font-medium text-ink/50">${it.sub}</span>
        </span>
      </button>`,
      )
      .join('')}
  </aside>`;
}

/** 顶栏右侧两个圆钮的通用交互（均为待接入/辅助） */
export function bindShell(root: HTMLElement): void {
  root.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.hash = '#/';
  });
  root.querySelector('[data-history]')?.addEventListener('click', () => {
    window.location.hash = '#/progress';
  });
  root.querySelector('[data-avatar]')?.addEventListener('click', () => {
    window.location.hash = '#/';
  });
}

export { pendingBadge };