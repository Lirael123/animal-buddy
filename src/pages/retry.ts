import { pageVersion, isCurrentPage } from './lifecycle';
import { toast, playAudio, escapeHtml } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';
import {
  fetchDictationRecords,
  fetchDictationList,
  fetchDictationAudio,
  submitDictation,
  type DictationRecordItem,
  type DictationItem,
} from '../api/client';

const TABS: SideItem[] = [
  { key: 'retry', emoji: '📝', title: '错题巩固', sub: '再练一遍' },
];

interface RetryEntry {
  record: DictationRecordItem;
  item: DictationItem | null;
}

/** 从错题记录 + 题库拼出待巩固列表 */
async function loadWrong(): Promise<RetryEntry[]> {
  const [records, list] = await Promise.all([
    fetchDictationRecords(),
    fetchDictationList().catch(() => ({ items: [] as DictationItem[] })),
  ]);
  const titleMap = new Map(list.items.map((i) => [i.id, i]));
  return records
    .map((r) => ({ record: r, item: titleMap.get(r.qid) ?? null }))
    .filter((e) => e.item);
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) {
    toast('当前浏览器不支持语音朗读');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
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

      <section id="retry-content" class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        <div class="flex items-center justify-center py-24 text-lg font-bold text-ink/45">正在加载你的错题…</div>
      </section>
    </main>
  </div>`;
}

async function loadContent(root: HTMLElement): Promise<void> {
  const version = pageVersion();
  const content = root.querySelector('#retry-content');
  if (!content) return;
  try {
    const wrong = await loadWrong();
    if (!isCurrentPage(version)) return;
    if (wrong.length === 0) {
      content.innerHTML = `
        <div class="py-24 text-center">
          <p class="text-6xl">🎉</p>
          <p class="mt-4 text-xl font-extrabold text-ink/60">太棒了！你没有待巩固的错题。</p>
          <button data-back-overview class="pressable mt-6 rounded-2xl bg-grass px-6 py-3 text-lg font-extrabold text-white">回学习概况</button>
        </div>`;
      root.querySelector('[data-back-overview]')?.addEventListener('click', () => {
        window.location.hash = '#/progress';
      });
      return;
    }
    content.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-2xl font-extrabold text-ink">我的错题本</h2>
      </div>
      <p class="mt-1 text-sm font-medium text-ink/50">下面 ${wrong.length} 道题需要再巩固。点「再练一次」听语音并重新作答，答对后会自动移出错题。</p>

      <div class="mt-5 flex flex-col gap-3">
        ${wrong
          .map((e, i) => {
            const it = e.item!;
            return `
            <div class="flex flex-wrap items-center gap-3 rounded-3xl bg-cream-deep/60 p-4 ring-1 ring-orange-light/50">
              <span class="grid h-11 w-11 place-items-center rounded-2xl bg-orange-light/70 text-xl font-extrabold text-orange-deep">${i + 1}</span>
              <div class="flex-1">
                <p class="text-xl font-extrabold text-ink">${it.type === 'word' ? it.audioText : it.prompt} <span class="text-base font-bold text-ink/50">P${it.page}</span></p>
                <p class="text-sm font-medium text-ink/45">${it.section} · 完成重练后更新进度</p>
              </div>
              <button data-audio="${it.id}" class="pressable grid h-11 w-11 place-items-center rounded-full bg-sky-pale text-xl">🔊</button>
              <button data-practice="${it.id}" class="pressable rounded-2xl bg-grass px-5 py-2.5 text-base font-extrabold text-white shadow-soft">再练一次</button>
            </div>`;
          })
          .join('')}
      </div>

      <div id="practice-panel" class="mt-6 hidden rounded-3xl bg-mint-pale/50 p-5 ring-1 ring-mint-soft">
        <p id="practice-q" class="text-xl font-extrabold text-ink"></p>
        <button data-play-again class="pressable mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-base font-extrabold text-ink shadow-sm">🔄 再听一次</button>
        <input id="practice-input" type="text" autocomplete="off" placeholder="写出你听到的内容…"
          class="mt-3 w-full rounded-2xl border-2 border-mint-soft bg-white/70 px-4 py-3 text-xl font-bold text-ink outline-none focus:border-grass" />
        <button id="practice-submit" class="pressable mt-3 w-full rounded-2xl bg-grass py-3 text-xl font-extrabold text-white">提交重练</button>
        <div id="practice-result" class="mt-3"></div>
      </div>`;
    bindWrongActions(root, wrong);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isCurrentPage(version)) return;
    content.innerHTML = `<div class="py-20 text-center text-lg font-bold text-ink/50">加载失败：${escapeHtml(msg)}</div>`;
  }
}

function bindWrongActions(root: HTMLElement, wrong: RetryEntry[]): void {
  let active: RetryEntry | null = null;
  let answered = false;
  let submitting = false;
  const version = pageVersion();

  const panel = root.querySelector<HTMLElement>('#practice-panel');
  const qEl = root.querySelector<HTMLElement>('#practice-q');
  const input = root.querySelector<HTMLInputElement>('#practice-input');
  const resultEl = root.querySelector<HTMLElement>('#practice-result');
  const submitBtn = root.querySelector<HTMLButtonElement>('#practice-submit');

  const openPractice = (entry: RetryEntry): void => {
    active = entry;
    answered = false;
    if (panel && qEl && input && resultEl) {
      panel.classList.remove('hidden');
      qEl.textContent = entry.item!.source === 'textbook'
        ? `请重写完整句（P${entry.item!.page}）`
        : `请重写这个单词（P${entry.item!.page}）`;
      input.value = '';
      input.focus();
      resultEl.innerHTML = '';
    }
  };

  const submit = async (): Promise<void> => {
    if (!active || submitting) return;
    if (answered) {
      // 已答对 → 重新加载（该题移出错题本）
      await loadContent(root);
      return;
    }
    const val = (input?.value ?? '').trim();
    if (!val) {
      toast('先写下你听到的内容');
      return;
    }
    submitting = true;
    try {
      const res = await submitDictation(active.record.qid, val, {
        session: active.record.session,
        isRetry: true,
      });
      if (!isCurrentPage(version)) return;
      answered = res.correct;
      if (resultEl) {
        resultEl.innerHTML = res.correct
          ? `<div class="animate-pop-in rounded-2xl bg-grass-pale px-4 py-3 ring-2 ring-grass-soft"><span class="text-lg font-extrabold text-grass-deep">🎉 答对啦！已从错题本移除。</span></div>`
          : `<div class="animate-pop-in rounded-2xl bg-orange-light/40 px-4 py-3 ring-2 ring-orange-light">
               <span class="text-lg font-extrabold text-orange-deep">${escapeHtml(res.hint)}</span>
               ${res.reference ? `<p class="mt-1 text-base font-bold text-ink/70">规范表达：<b>${escapeHtml(res.reference)}</b></p>` : ''}
             </div>`;
      }
      if (submitBtn) submitBtn.textContent = res.correct ? '完成 ✓' : '再试一次';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isCurrentPage(version)) toast(`提交失败：${escapeHtml(msg)}`);
    } finally { submitting = false; }
  };

  root.querySelectorAll<HTMLButtonElement>('[data-audio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.audio!;
      const entry = wrong.find((w) => w.item!.id === id);
      if (!entry) return;
      void fetchDictationAudio(id)
        .then((res) => {
          if (!isCurrentPage(version)) return;
          void playAudio(res.url);
          toast(res.source === 'textbook' ? '播放教材原声 🎧' : '播放 AI 合成语音（教学改编）');
        })
        .catch(() => toast('语音播放失败'));
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-practice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.practice!;
      const entry = wrong.find((w) => w.item!.id === id);
      if (entry) {
        openPractice(entry);
        speak(entry.item!.audioText);
      }
    });
  });

  root.querySelector('[data-play-again]')?.addEventListener('click', () => {
    if (active) speak(active.item!.audioText);
  });
  submitBtn?.addEventListener('click', () => void submit());
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
}

export function bindRetry(root: HTMLElement): void {
  bindShell(root);
  void loadContent(root);
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.side === 'retry') return;
      toast('该板块待接入', { pending: true });
    });
  });
}