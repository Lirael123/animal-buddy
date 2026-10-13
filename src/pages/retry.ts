import { toast } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';

interface WrongItem {
  word: string;
  zh: string;
  from: string;
  count: number;
}

const WRONG: WrongItem[] = [
  { word: 'dog', zh: '狗', from: 'Part A 单词听写', count: 2 },
  { word: 'rabbit', zh: '兔子', from: 'Part A 单词听写', count: 1 },
  { word: 'giraffe', zh: '长颈鹿', from: 'Part B 单词听写', count: 3 },
];

const TABS: SideItem[] = [
  { key: 'retry', emoji: '📝', title: '错题巩固', sub: '再练一遍' },
  { key: 'all', emoji: '📚', title: '全部练习', sub: '从头复习' },
  { key: 'star', emoji: '⭐', title: '收藏夹', sub: '重点词汇' },
];

function speak(word: string): void {
  if (!('speechSynthesis' in window)) {
    toast('当前浏览器不支持语音朗读');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.8;
  window.speechSynthesis.speak(u);
}

export function renderRetry(): string {
  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '📝', emojiBg: 'bg-orange-light', title: 'Try Again', subtitle: '错题巩固' })}

    <main class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <div class="lg:w-60 lg:shrink-0">${sideMenu(TABS, 'retry')}</div>

      <section class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-2xl font-extrabold text-ink">我的错题本</h2>
          <button data-clear-wrong class="pressable rounded-2xl bg-mint-pale px-4 py-2 text-sm font-extrabold text-ink">清空错题</button>
        </div>
        <p class="mt-1 text-sm font-medium text-ink/50">共 ${WRONG.length} 个待巩固单词，点「再练一次」大声跟读吧！</p>

        <div class="mt-5 flex flex-col gap-3">
          ${WRONG.map(
            (w, i) => `
            <div class="flex flex-wrap items-center gap-3 rounded-3xl bg-cream-deep/60 p-4 ring-1 ring-orange-light/50">
              <span class="grid h-11 w-11 place-items-center rounded-2xl bg-orange-light/70 text-xl font-extrabold text-orange-deep">${i + 1}</span>
              <div class="flex-1">
                <p class="text-2xl font-extrabold text-ink">${w.word} <span class="text-base font-bold text-ink/50">${w.zh}</span></p>
                <p class="text-sm font-medium text-ink/45">${w.from} · 错过 ${w.count} 次</p>
              </div>
              <button data-speak-word="${w.word}" class="pressable grid h-11 w-11 place-items-center rounded-full bg-sky-pale text-xl">🔊</button>
              <button data-practice="${w.word}" class="pressable rounded-2xl bg-grass px-5 py-2.5 text-base font-extrabold text-white shadow-soft">再练一次</button>
            </div>`,
          ).join('')}
        </div>

        <button data-practice-all class="pressable mt-6 w-full rounded-2xl bg-orange py-4 text-xl font-extrabold text-white shadow-float">🔁 开始全部巩固练习</button>
      </section>
    </main>
  </div>`;
}

export function bindRetry(root: HTMLElement): void {
  bindShell(root);
  root.querySelectorAll<HTMLButtonElement>('[data-speak-word]').forEach(btn => {
    btn.addEventListener('click', () => speak(btn.dataset.speakWord ?? ''));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-practice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = btn.dataset.practice ?? '';
      speak(word);
      toast(`跟读示例：「${word}」。错题订正结果将在接入学习记录后保存`, { pending: true });
    });
  });
  root.querySelector('[data-practice-all]')?.addEventListener('click', () => {
    WRONG.forEach((w, i) => setTimeout(() => speak(w.word), i * 900));
    toast('开始巩固练习（浏览器示例朗读），学习记录待接入', { pending: true });
  });
  root.querySelector('[data-clear-wrong]')?.addEventListener('click', () =>
    toast('错题数据来自后端学习记录，接入后可清空', { pending: true }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.side === 'retry') return;
      toast('该板块待接入', { pending: true });
    });
  });
}