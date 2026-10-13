import { ASSETS } from '../assets';
import { toast } from '../components/ui';

interface MenuCard {
  id: string;
  img: string;
  title: string;
  sub: string;
}

const MENU: MenuCard[] = [
  { id: 'talk', img: ASSETS.petsCard, title: "Let's Talk", sub: '情境对话' },
  { id: 'listen', img: ASSETS.panda, title: "Let's Listen", sub: '听力与听写' },
  { id: 'retry', img: ASSETS.notebook, title: 'Try Again', sub: '错题巩固' },
  { id: 'progress', img: ASSETS.trophy, title: 'My Progress', sub: '学习成长' },
];

export function renderHome(): string {
  const cards = MENU.map(
    (c, i) => `
    <button data-card="${c.id}" class="pressable group animate-fade-slide-up relative flex flex-col overflow-hidden rounded-[2rem] bg-white pb-5 text-center shadow-card ring-1 ring-black/5 hover:-translate-y-1.5"
      style="animation-delay:${120 + i * 90}ms">
      <span class="block aspect-[5/3] w-full overflow-hidden">
        <img src="${c.img}" alt="${c.title}" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="${i === 0 ? 'eager' : 'lazy'}" width="400" height="240" />
      </span>
      <span class="mt-2 block text-2xl font-extrabold leading-7 text-ink">${c.title}</span>
      <span class="block text-base font-bold text-ink/55">${c.sub}</span>
      <span class="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-orange text-2xl font-extrabold text-white shadow-md transition-transform group-hover:translate-x-0.5">›</span>
    </button>`,
  ).join('');

  return `
  <div class="relative min-h-screen w-full overflow-hidden">
    <!-- 天空草地背景 -->
    <div class="absolute inset-0">
      <div class="absolute inset-x-0 top-0 h-[58%]" style="background:linear-gradient(#8fd3ff 0%,#bfe9ff 55%,#dcf4ff 100%)"></div>
      <div class="absolute inset-x-0 bottom-0 h-[48%]" style="background:linear-gradient(#8fdd7a 0%,#6ccb5f 60%,#57bd4f 100%)"></div>
      <!-- 树与房子（装饰剪影） -->
      <div class="absolute left-0 top-6 text-[120px] opacity-90 sm:text-[180px]">🌳</div>
      <div class="absolute right-2 top-16 hidden text-[120px] sm:block">🏡</div>
      <div class="absolute right-24 top-24 hidden text-4xl sm:block">🌳</div>
      <!-- 花 -->
      <div class="absolute bottom-10 left-8 text-4xl">🌼</div>
      <div class="absolute bottom-16 left-1/4 text-3xl">🌸</div>
      <div class="absolute bottom-8 right-1/3 text-4xl">🌼</div>
      <div class="absolute bottom-20 right-10 text-3xl">🌸</div>
    </div>

    <main class="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-28 pt-5 sm:px-8">
      <!-- 右上用户栏 -->
      <div class="absolute right-5 top-5 flex items-center gap-3 rounded-3xl bg-white/90 py-2 pl-2 pr-5 shadow-md">
        <img src="${ASSETS.avatarBoy}" alt="小朋友头像" class="h-12 w-12 rounded-full object-cover ring-2 ring-sky-pale" width="48" height="48" />
        <div class="leading-tight">
          <p class="text-lg font-extrabold text-ink">Hello, 小朋友!</p>
          <p class="flex items-center gap-1 text-base font-bold text-orange-deep"><span>🪙</span><span id="coin-count">12</span></p>
        </div>
      </div>

      <!-- 主体：兔子 + 木牌标题 -->
      <div class="relative mt-6 flex flex-col items-center sm:mt-2 sm:flex-row sm:items-start sm:gap-2">
        <div class="relative w-56 shrink-0 sm:-ml-2 sm:w-[340px]">
          <div class="animate-bob drop-shadow-2xl">
            <img src="${ASSETS.bunnyHero}" alt="粉色小兔子 Rex 挥手" class="w-full" width="340" height="453" fetchpriority="high" />
          </div>
        </div>

        <div class="mt-1 flex flex-1 flex-col items-center sm:mt-8 sm:items-start">
          <h1 class="text-center sm:text-left" style="line-height:0.92">
            <span class="title-stroke block text-6xl font-extrabold text-grass-deep sm:text-7xl">Animal</span>
            <span class="title-stroke block text-7xl font-extrabold text-orange sm:text-8xl">Buddy</span>
          </h1>
          <div class="wood-sign mt-4 rounded-2xl px-8 py-2">
            <p class="text-2xl font-extrabold text-ink sm:text-3xl" style="font-family:'Comic Sans MS','Baloo 2',cursive">Our Animal Friends</p>
          </div>
          <div class="wood-sign mt-2 rounded-2xl px-7 py-1.5">
            <p class="text-xl font-bold text-ink/80 sm:text-2xl">人教版三年级上册 Unit 3</p>
          </div>
        </div>
      </div>

      <!-- 四个入口卡片 -->
      <div class="mt-6 grid grid-cols-2 gap-4 sm:mt-4 sm:grid-cols-4 sm:gap-5">
        ${cards}
      </div>
    </main>

    <!-- 底部提示条 -->
    <div class="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center px-4 pb-4">
      <div class="flex w-full max-w-2xl items-center justify-center gap-2 rounded-full bg-white/85 py-3 text-center shadow-float backdrop-blur">
        <span class="text-2xl">📣</span>
        <span class="text-lg font-bold text-grass-deep sm:text-xl">和 Animal Buddy 一起，快乐学英语吧！</span>
      </div>
      <button data-settings class="pressable absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full bg-white text-2xl shadow-md">⚙️</button>
    </div>
  </div>`;
}

export function bindHome(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.card as string;
      window.location.hash = `#/${route}`;
    });
  });
  root.querySelector('[data-settings]')?.addEventListener('click', () => {
    toast('设置功能即将上线（待接入）', { pending: true });
  });
}