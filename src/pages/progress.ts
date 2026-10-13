import { ASSETS } from '../assets';
import { toast } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';
import {
  fetchProgress,
  fetchDictationRecords,
  fetchDictationList,
  type ProgressSummary,
  type DictationRecordItem,
  type DictationItem,
} from '../api/client';

type TabKey = 'overview' | 'wrong' | 'master';

const TABS: SideItem[] = [
  { key: 'overview', emoji: '📊', title: '学习概况', sub: '数据总览' },
  { key: 'wrong', emoji: '📋', title: '我的错题', sub: '查漏补缺' },
  { key: 'master', emoji: '⭐', title: '掌握情况', sub: '待巩固内容' },
];

export function renderProgress(): string {
  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '🏆', emojiBg: 'bg-yellow-300', title: 'My Progress', subtitle: '学习成长' })}

    <main class="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <div class="lg:w-60 lg:shrink-0">${sideMenu(TABS, 'overview')}</div>

      <section id="progress-content" class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        <div class="flex items-center justify-center py-24 text-lg font-bold text-ink/45">正在加载你的学习数据…</div>
      </section>

      <!-- 右侧伙伴鼓励 -->
      <aside class="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
        <div class="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-mint-pale to-grass-soft/40 p-5 text-center shadow-card ring-1 ring-black/5">
          <h3 class="text-left text-xl font-extrabold text-ink">我的学习伙伴</h3>
          <img src="${ASSETS.bunnyThumbs}" alt="Rex 为你点赞" class="mx-auto mt-2 w-40" width="160" height="213" loading="lazy" />
          <div class="absolute right-4 top-12 rounded-2xl bg-white px-3 py-1.5 text-sm font-extrabold text-ink shadow-md">太棒了！继续加油哦！</div>
          <div class="mt-2 flex justify-end gap-1 text-3xl">⭐⭐</div>
        </div>
        <button data-go-listen class="pressable w-full rounded-2xl bg-grass py-4 text-xl font-extrabold text-white shadow-float">🎧 去做听写练习</button>
      </aside>
    </main>
  </div>`;
}

async function loadOverview(root: HTMLElement): Promise<void> {
  const content = root.querySelector('#progress-content');
  if (!content) return;
  try {
    const [p, records, list] = await Promise.all([
      fetchProgress(),
      fetchDictationRecords().catch(() => [] as DictationRecordItem[]),
      fetchDictationList().catch(() => ({ items: [] as DictationItem[] })),
    ]);
    const titleMap = new Map(list.items.map((i) => [i.id, i]));
    content.innerHTML = renderOverview(p, records, titleMap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    content.innerHTML = `<div class="py-20 text-center text-lg font-bold text-ink/50">加载失败：${msg}</div>`;
  }
}

function renderOverview(
  p: ProgressSummary,
  records: DictationRecordItem[],
  titleMap: Map<string, DictationItem>,
): string {
  const stat = (icon: string, value: string, label: string) => `
    <div class="rounded-3xl bg-mint-pale/70 p-4 text-center">
      <div class="text-3xl">${icon}</div>
      <div class="mt-1 text-3xl font-extrabold text-ink">${value}</div>
      <div class="text-sm font-bold text-ink/50">${label}</div>
    </div>`;

  const wrongList = records.length
    ? records.map((r) => {
        const t = titleMap.get(r.qid);
        return `
        <div class="flex items-center gap-3 px-4 py-3.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange text-lg text-white">📌</span>
          <span class="flex-1 text-lg font-bold text-ink">${t ? `${t.prompt}（P${t.page}）` : `题目 ${r.qid}`}</span>
          <span class="text-sm font-bold text-ink/45">${r.firstCorrect === 1 ? '首回正确' : '已重练'}</span>
          <span class="text-base font-extrabold ${r.mastered ? 'text-grass-deep' : 'text-orange-deep'}">${r.mastered ? '已掌握' : '待巩固'}</span>
        </div>`;
      }).join('')
    : '<p class="px-4 py-6 text-center text-lg font-bold text-ink/45">还没有错题记录，很棒！去 Let\'s Listen 练一练吧 🎧</p>';

  const pendingList = p.reviewRecommend.length
    ? p.reviewRecommend.map((qid) => {
        const t = titleMap.get(qid);
        const label = t ? `${t.type === 'word' ? '🔤' : '✏️'} ${t.prompt}（P${t.page}）` : `题目 ${qid}`;
        return `<div class="flex items-center gap-3 px-4 py-3.5"><span class="text-lg">${label}</span></div>`;
      }).join('')
    : '<p class="px-4 py-6 text-center text-lg font-bold text-ink/45">暂无待巩固内容，继续保持！🌟</p>';

  return `
    <div class="mb-2 flex items-center gap-2">
      <h2 class="text-2xl font-extrabold text-ink">我的学习数据</h2>
      <span class="rounded-full bg-grass-pale px-3 py-1 text-sm font-extrabold text-grass-deep">实时同步</span>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      ${stat('📋', `${p.exercised}`, '已完成练习')}
      ${stat('⭐', `${p.masteredVocab}`, '已掌握词汇')}
      ${stat('🎯', `${Math.round(p.firstPassRate * 100)}%`, '首次正确率')}
      ${stat('💪', `${p.correctionCount}`, '纠错成功')}
    </div>

    <div class="mt-6">
      <h3 class="text-xl font-extrabold text-ink">📌 待巩固知识点</h3>
      <div class="mt-2 divide-y divide-mint-soft/60 rounded-3xl ring-1 ring-mint-soft/60">${pendingList}</div>
    </div>

    <div class="mt-6">
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-extrabold text-ink">我的错题</h3>
        <button data-goto-retry class="pressable text-base font-bold text-grass-deep">去重练 ›</button>
      </div>
      <div class="mt-2 divide-y divide-mint-soft/60 rounded-3xl ring-1 ring-mint-soft/60">${wrongList}</div>
    </div>`;
}

export function bindProgress(root: HTMLElement): void {
  bindShell(root);
  void loadOverview(root);

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.side as TabKey;
      if (key === 'wrong') {
        window.location.hash = '#/retry';
        return;
      }
      if (key === 'master') {
        void loadOverview(root); // 掌握情况就是待巩固，复用总览
        return;
      }
    });
  });
  root.querySelector('[data-goto-retry]')?.addEventListener('click', () => {
    window.location.hash = '#/retry';
  });
  root.querySelector('[data-go-listen]')?.addEventListener('click', () => {
    window.location.hash = '#/listen';
  });
}