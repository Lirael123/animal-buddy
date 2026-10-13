import { ASSETS } from '../assets';
import { toast } from '../components/ui';
import { topBar, sideMenu, bindShell, pendingBadge, type SideItem } from '../components/shell';

type TabKey = 'overview' | 'wrong' | 'master' | 'badge';

const TABS: SideItem[] = [
  { key: 'overview', emoji: '📊', title: '学习概况', sub: '数据总览' },
  { key: 'wrong', emoji: '📋', title: '我的错题', sub: '查漏补缺' },
  { key: 'master', emoji: '⭐', title: '掌握情况', sub: '已学内容' },
  { key: 'badge', emoji: '🏅', title: '证书奖励', sub: '成长徽章' },
];

const RECORDS = [
  { ok: true, name: 'My Pet 情境对话', time: '12月10日 14:32', score: 90 },
  { ok: false, name: 'dog 单词听写', time: '12月10日 14:20', score: 60 },
  { ok: true, name: 'At the Zoo 情境对话', time: '12月9日 15:10', score: 95 },
];

const STATS = [
  { icon: '📋', value: '12', label: '练习次数' },
  { icon: '🎯', value: '83%', label: '首次正确率' },
  { icon: '📈', value: '92%', label: '重练正确率' },
  { icon: '⭐', value: '8', label: '已掌握内容' },
];

export function renderProgress(): string {
  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '🏆', emojiBg: 'bg-yellow-300', title: 'My Progress', subtitle: '学习成长' })}

    <main class="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <div class="lg:w-60 lg:shrink-0">${sideMenu(TABS, 'overview')}</div>

      <section class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        <div class="mb-2 flex items-center gap-2">
          <h2 class="text-2xl font-extrabold text-ink">我的学习数据</h2>
          ${pendingBadge('数据待接入')}
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          ${STATS.map(
            x => `
            <div class="rounded-3xl bg-mint-pale/70 p-4 text-center">
              <div class="text-3xl">${x.icon}</div>
              <div class="mt-1 text-3xl font-extrabold text-ink">${x.value}</div>
              <div class="text-sm font-bold text-ink/50">${x.label}</div>
            </div>`,
          ).join('')}
        </div>

        <div class="mt-6 flex items-center justify-between">
          <h3 class="text-xl font-extrabold text-ink">最近练习记录</h3>
          <button data-more class="pressable text-base font-bold text-grass-deep">更多 ›</button>
        </div>
        <div class="mt-3 divide-y divide-mint-soft/60 rounded-3xl ring-1 ring-mint-soft/60">
          ${RECORDS.map(
            r => `
            <div class="flex items-center gap-3 px-4 py-3.5">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-white ${r.ok ? 'bg-grass' : 'bg-red-400'}">${r.ok ? '✓' : '✕'}</span>
              <span class="flex-1 text-lg font-bold text-ink">${r.name}</span>
              <span class="hidden text-base font-medium text-ink/45 sm:inline">${r.time}</span>
              <span class="w-16 text-right text-xl font-extrabold ${r.ok ? 'text-grass-deep' : 'text-red-400'}">${r.score}分</span>
            </div>`,
          ).join('')}
        </div>
      </section>

      <!-- 右侧伙伴鼓励 -->
      <aside class="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
        <div class="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-mint-pale to-grass-soft/40 p-5 text-center shadow-card ring-1 ring-black/5">
          <h3 class="text-left text-xl font-extrabold text-ink">我的学习伙伴</h3>
          <img src="${ASSETS.bunnyThumbs}" alt="Rex 为你点赞" class="mx-auto mt-2 w-40" width="160" height="213" loading="lazy" />
          <div class="absolute right-4 top-12 rounded-2xl bg-white px-3 py-1.5 text-sm font-extrabold text-ink shadow-md">太棒了！继续加油哦！</div>
          <div class="mt-2 flex justify-end gap-1 text-3xl">⭐⭐</div>
          <button data-badge class="pressable mt-3 w-full rounded-2xl bg-yellow-400 py-3 text-lg font-extrabold text-ink shadow-float">🎖️ 领取成长徽章</button>
        </div>
        <button data-teacher class="pressable w-full rounded-2xl bg-indigo-500 py-4 text-xl font-extrabold text-white shadow-float">👥 教师登录入口</button>
      </aside>
    </main>
  </div>`;
}

export function bindProgress(root: HTMLElement): void {
  bindShell(root);
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.side as TabKey;
      if (key === 'overview') return;
      if (key === 'wrong') {
        window.location.hash = '#/retry';
        return;
      }
      toast('该板块将在接入学习记录后启用', { pending: true });
    });
  });
  root.querySelector('[data-more]')?.addEventListener('click', () =>
    toast('完整学习记录将在接入后端后展示', { pending: true }),
  );
  root.querySelector('[data-badge]')?.addEventListener('click', () =>
    toast('成长徽章将在达成目标并接入记录后解锁', { pending: true }),
  );
  root.querySelector('[data-teacher]')?.addEventListener('click', () =>
    toast('教师登录入口待接入', { pending: true }),
  );
}