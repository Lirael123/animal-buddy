import { buddySVG } from '../components/buddy';
import { navigate } from './router';

interface MenuCard {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  route: 'talk' | 'home';
}

const MENU: MenuCard[] = [
  {
    id: 'talk',
    title: "Let's Talk",
    desc: '开口说英语',
    icon: '💬',
    color: 'bg-orange',
    route: 'talk',
  },
  {
    id: 'listen',
    title: "Let's Listen",
    desc: '听教材原声',
    icon: '🎧',
    color: 'bg-pink',
    route: 'talk',
  },
  {
    id: 'again',
    title: 'Try Again',
    desc: '再练一遍',
    icon: '🔁',
    color: 'bg-mint',
    route: 'talk',
  },
  {
    id: 'progress',
    title: 'My Progress',
    desc: '看看我的进步',
    icon: '⭐',
    color: 'bg-orange-deep',
    route: 'talk',
  },
];

export function renderHome(): string {
  const cards = MENU.map(
    (c, i) => `
    <button data-card="${c.id}" class="pressable group animate-fade-slide-up flex w-full max-w-xs items-center gap-4 rounded-4xl ${c.color} px-6 py-5 text-white shadow-soft ring-4 ring-white/60 hover:-translate-y-1 hover:shadow-float"
      style="animation-delay:${150 + i * 90}ms">
      <span class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/25 text-3xl">${c.icon}</span>
      <span class="text-left">
        <span class="block text-2xl font-extrabold leading-tight">${c.title}</span>
        <span class="block text-sm font-medium text-white/85">${c.desc}</span>
      </span>
      <span class="ml-auto text-2xl text-white/70 transition-transform group-hover:translate-x-1">›</span>
    </button>`,
  ).join('');

  return `
  <div class="relative min-h-full w-full overflow-hidden">
    <!-- 背景装饰 -->
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-mint-soft/50 blur-2xl"></div>
      <div class="absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-orange-light/50 blur-3xl"></div>
      <div class="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-pink-light/40 blur-2xl"></div>
      <svg viewBox="0 0 1440 220" class="absolute bottom-0 w-full" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,120 C240,40 480,40 720,90 C960,140 1200,140 1440,70 L1440,220 L0,220 Z" fill="#A8E6CF"/>
      </svg>
    </div>

    <main class="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col items-center px-6 py-8">
      <div class="animate-bob mt-2 drop-shadow-[0_18px_20px_rgba(244,143,177,0.35)]">${buddySVG({ size: 168 })}</div>

      <h1 class="mt-3 text-center">
        <span class="block text-4xl font-extrabold text-ink">Animal Buddy</span>
        <span class="mt-1 block text-lg font-semibold text-orange-deep">和 REX 一起快乐学英语</span>
      </h1>

      <div class="mt-7 flex w-full flex-col items-center gap-3.5">
        ${cards}
      </div>

      <p class="mt-8 text-center text-xs font-medium text-ink/40">动物伙伴 · 三年级英语开口练习</p>
    </main>
  </div>`;
}

export function bindHome(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.card as string;
      // 原型阶段专注两页预览：Let's Talk 已实现，其它入口暂先接入该页，
      // 后续再按各自功能（听原声 / 重练 / 进度）拆分为独立页面。
      void route;
      navigate('talk');
    });
  });
}