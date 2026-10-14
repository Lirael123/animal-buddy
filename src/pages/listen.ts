import { pageVersion, isCurrentPage } from './lifecycle';
import { ASSETS } from '../assets';
import { toast, playAudio, escapeHtml } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';
import {
  fetchDictationList,
  fetchDictationAudio,
  submitDictation,
  type DictationItem,
  type DictationScoreResult,
} from '../api/client';

type FilterKey = 'all' | 'word' | 'sentence';

const FILTERS: { key: FilterKey; emoji: string; title: string; sub: string }[] = [
  { key: 'all', emoji: '📚', title: '全部练习', sub: '听写与句型' },
  { key: 'word', emoji: '🔤', title: '单词听写', sub: '拼一拼' },
  { key: 'sentence', emoji: '✏️', title: '句型巩固', sub: '写完整句' },
];

const state: {
  filter: FilterKey;
  pool: DictationItem[];
  index: number;
  answered: boolean;
  status: DictationScoreResult | null;
  session: string;
  loaded: boolean;
  loading: boolean;
  submitting: boolean;
  loadError: string;
} = {
  filter: 'all',
  pool: [],
  index: 0,
  answered: false,
  status: null,
  session: '',
  loaded: false,
  loading: false,
  submitting: false,
  loadError: '',
};

/** 每个练习批次一个 session（同一轮内重练/刷新沿用，避免成绩重复累计） */
function ensureSession(): string {
  if (state.session) return state.session;
  const saved = sessionStorage.getItem('ab-listen-session');
  if (saved) {
    state.session = saved;
    return saved;
  }
  const s = `listen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  sessionStorage.setItem('ab-listen-session', s);
  state.session = s;
  return s;
}

let loadGeneration = 0;
export function cleanupListen(): void {
  loadGeneration++;
  if (state.loading) state.loaded = false;
  state.loading = state.submitting = false;
}
async function loadPool(filter: FilterKey): Promise<void> {
  const version = pageVersion();
  const generation = ++loadGeneration;
  state.loading = true;
  state.loadError = '';
  try {
    const res = await fetchDictationList(filter === 'all' ? '' : (filter as 'word' | 'sentence'));
    const all = filter === 'all' ? res.items : await (async () => {
      // 已按 type 返回，无需二次请求
      return res.items;
    })();
    if (!isCurrentPage(version) || filter !== state.filter) return;
    state.pool = all;
    state.index = 0;
    state.answered = false;
    state.status = null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isCurrentPage(version) || filter !== state.filter) return;
    state.loadError = msg;
    toast(`加载题目失败：${msg}`);
    state.pool = [];
  } finally {
    if (generation === loadGeneration) { state.loaded = true; state.loading = false; }
  }
}

/** 播放当前题语音（教材原声或 TTS，如实标注来源） */
let playbackRequest = 0;
async function playCurrent(qid: string): Promise<void> {
  const version = pageVersion();
  const request = ++playbackRequest;
  try {
    const res = await fetchDictationAudio(qid);
    if (!isCurrentPage(version) || request !== playbackRequest || state.pool[state.index]?.id !== qid) return;
    await playAudio(res.url);
    if (res.source === 'textbook') {
      toast('正在播放教材原声 🎧');
    } else {
      toast('正在播放 AI 合成语音（教学改编练习）');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isCurrentPage(version)) toast(`语音播放失败：${msg}`);
  }
}

function eqWave(): string {
  return Array.from({ length: 26 })
    .map((_, i) => {
      const h = 6 + Math.round(14 * Math.abs(Math.sin(i * 0.9)));
      return `<span class="eq-bar idle" style="height:${h}px"></span>`;
    })
    .join('');
}

export function renderListen(): string {
  const total = state.pool.length;
  const item = state.pool[state.index];
  const progressPct = total ? ((state.index + (state.answered ? 1 : 0)) / total) * 100 : 0;

  const side: SideItem[] = FILTERS.map((x) => ({
    key: x.key,
    emoji: x.emoji,
    title: x.title,
    sub: x.sub,
  }));

  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '🦻', emojiBg: 'bg-pink-light', title: "Let's Listen", subtitle: '听力与听写' })}

    <main class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <div class="lg:w-64 lg:shrink-0">${sideMenu(side, state.filter)}</div>

      <section class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        ${
          !item
            ? `<div class="py-20 text-center">
                 <p class="text-5xl">📭</p>
                 <p class="mt-3 text-xl font-extrabold text-ink/50">${state.loadError ? escapeHtml(state.loadError) : state.loading ? '题库加载中…' : '暂无题目或本组练习已完成'}</p>
                 <button data-reload class="pressable mt-5 rounded-2xl bg-grass px-6 py-3 text-lg font-extrabold text-white">重新加载</button>
               </div>`
            : `
        <div class="flex items-center justify-between">
          <p class="text-lg font-bold text-ink/55">${item.section} · P${item.page}</p>
          <p class="text-2xl font-extrabold text-ink">${state.index + 1} / ${total}</p>
        </div>
        <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-mint-pale">
          <div class="h-full rounded-full bg-grass transition-all duration-500" style="width:${progressPct}%"></div>
        </div>

        <!-- 来源说明 -->
        <div class="mt-4 flex items-center gap-2">
          <span class="rounded-full px-3 py-1 text-sm font-extrabold ${
            item.source === 'textbook' ? 'bg-grass-pale text-grass-deep' : 'bg-sky-light/70 text-sky-deep'
          }">
            ${item.source === 'textbook' ? '✨ AI 合成朗读（教材句子）' : '✨ AI 合成（教学改编）'}
          </span>
          <span class="rounded-full bg-cream-deep px-3 py-1 text-sm font-bold text-ink/50">${item.type === 'word' ? '单词听写' : '句型巩固'} · ${item.difficulty}</span>
          ${item.scorable ? '' : '<span class="rounded-full bg-orange-light/50 px-3 py-1 text-sm font-bold text-orange-deep">仅展示</span>'}
        </div>

        <!-- 播放条 -->
        <div class="mt-5 flex flex-wrap items-center gap-4 rounded-3xl bg-mint-pale/60 p-4">
          <button data-play class="pressable grid h-16 w-16 place-items-center rounded-full bg-grass text-3xl text-white shadow-float">▶</button>
          <span class="flex h-10 flex-1 items-center gap-1 overflow-hidden">${eqWave()}</span>
          <button data-replay class="pressable flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-lg font-extrabold text-ink shadow-sm">
            <span>🔄</span> 再听一次
          </button>
        </div>

        <!-- 提示语 -->
        <p class="mt-6 flex items-center gap-2 text-xl font-extrabold text-ink">
          <span>✏️</span> ${item.prompt}
        </p>

        <!-- 输入 -->
        <input id="listen-input" type="text" autocomplete="off" placeholder="请输入你听到的英文…"
          class="mt-3 w-full rounded-2xl border-2 border-mint-soft bg-cream/60 px-5 py-4 text-xl font-bold text-ink outline-none transition-colors focus:border-grass" />

        <div class="mt-3 flex items-center gap-3">
          <button id="submit-answer" class="pressable flex-1 rounded-2xl bg-grass py-4 text-2xl font-extrabold text-white shadow-float">提交答案</button>
          <button data-mic class="pressable rounded-2xl bg-mint-pale px-3 py-2 text-sm font-bold text-ink/60" title="查看语音输入说明">语音说明</button>
        </div>

        <div id="answer-result" class="mt-3"></div>

        <div class="mt-6 flex items-end justify-between gap-4">
          <div class="flex items-center gap-3 rounded-2xl bg-cream-deep/70 px-4 py-3">
            <span class="text-3xl">💡</span>
            <div>
              <p class="text-lg font-extrabold text-orange-deep">小提示</p>
              <p class="text-base font-medium text-ink/65">先听，再写。答错别灰心，提示后会重练到掌握为止。</p>
            </div>
          </div>
          <img src="${ASSETS.panda}" alt="戴耳机的熊猫伙伴" class="hidden h-32 w-32 rounded-3xl object-cover ring-2 ring-white shadow-sm sm:block" width="128" height="128" loading="lazy" />
        </div>`
        }
      </section>
    </main>
  </div>`;
}

/** 重新渲染前清空上一题输入，避免旧答案残留到新题目 */
function clearInput(root: HTMLElement): void {
  const old = root.querySelector<HTMLInputElement>('#listen-input');
  if (old) old.value = '';
}

/**
 * 统一的「换新题目」渲染：先清空旧输入 → 重新渲染 → 重新绑定；
 * autoplay=true 时在渲染后自动播放当前题语音（教材原声 / TTS），
 * 避免小朋友切题后听不到声音以为卡住。
 */
function rerender(root: HTMLElement, autoplay: boolean): void {
  clearInput(root);
  root.innerHTML = renderListen();
  bindListen(root);
  if (autoplay) {
    const item = state.pool[state.index];
    if (item) void playCurrent(item.id);
  }
}

/** 提交当前题 */
async function submitAnswer(root: HTMLElement): Promise<void> {
  if (state.submitting) return;
  const version = pageVersion();
  if (state.answered) {
    // 已提交且答对 → 下一题
    nextQuestion(root);
    return;
  }
  const item = state.pool[state.index];
  if (!item) return;
  const input = document.getElementById('listen-input') as HTMLInputElement | null;
  const value = (input?.value ?? '').trim();
  if (!value) {
    toast('先写下/说出你听到的内容，再提交哦');
    return;
  }
  const session = ensureSession();
  state.submitting = true;
  const button = root.querySelector<HTMLButtonElement>('#submit-answer');
  if (button) button.disabled = true;
  try {
    const res = await submitDictation(item.id, value, { session, isRetry: false });
    if (!isCurrentPage(version) || state.pool[state.index]?.id !== item.id) return;
    state.answered = res.correct;
    state.status = res;
    showResult(root, res);
    const btn = document.getElementById('submit-answer');
    if (btn) btn.textContent = res.correct ? '下一题 ➜' : '再试一次';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isCurrentPage(version)) toast(`提交失败：${msg}`);
  } finally {
    state.submitting = false;
    if (button) button.disabled = false;
  }
}

function showResult(root: HTMLElement, res: DictationScoreResult): void {
  const result = document.getElementById('answer-result');
  if (!result) return;
  if (res.asrSkipped) {
    result.innerHTML = `<div class="animate-pop-in flex items-center gap-3 rounded-2xl bg-sky-light/70 px-4 py-3 ring-2 ring-sky">
      <span class="text-2xl">🤔</span><span class="text-lg font-extrabold text-ink/70">${escapeHtml(res.hint)}</span></div>`;
    return;
  }
  if (res.correct) {
    result.innerHTML = `<div class="animate-pop-in flex items-center gap-3 rounded-2xl bg-grass-pale px-4 py-3 ring-2 ring-grass-soft">
      <span class="text-2xl">🎉</span><span class="text-lg font-extrabold text-grass-deep">${escapeHtml(res.hint)}</span></div>`;
  } else {
    result.innerHTML = `<div class="animate-pop-in rounded-2xl bg-orange-light/40 px-4 py-3 ring-2 ring-orange-light">
      <div class="flex items-center gap-3"><span class="text-2xl">💪</span>
      <span class="text-lg font-extrabold text-orange-deep">${escapeHtml(res.hint)}</span></div>
      ${res.reference ? `<p class="mt-2 rounded-xl bg-white/80 px-3 py-2 text-base font-bold text-ink/70">规范表达：<b>${escapeHtml(res.reference)}</b></p>` : ''}
    </div>`;
  }
}

function nextQuestion(root: HTMLElement): void {
  const next = state.index + 1;
  if (next >= state.pool.length) {
    toast('本组练习完成啦，真棒！默认会保留你的错题到 My Progress');
    state.pool = [];
    state.index = 0;
    state.answered = false;
    state.status = null;
    // 开启新一轮 session
    sessionStorage.removeItem('ab-listen-session');
    state.session = '';
    rerender(root, true);
    return;
  }
  state.index = next;
  state.answered = false;
  state.status = null;
  rerender(root, true);
}

export function bindListen(root: HTMLElement): void {
  bindShell(root);
  ensureSession();

  // 若题库未加载，先加载；加载完成后渲染并自动播放第一题
  if (!state.loaded && !state.loading) {
    const version = pageVersion();
    loadPool(state.filter).then(() => {
      if (isCurrentPage(version)) rerender(root, false);
    });
  }

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.loading || state.submitting) return;
      state.filter = btn.dataset.side as FilterKey;
      state.loaded = false;
      state.pool = [];
      state.index = 0;
      state.answered = false;
      state.status = null;
      // 切换分类重新生成批次
      sessionStorage.removeItem('ab-listen-session');
      state.session = '';
      // 先渲染空态并清空输入；题库加载完成后由 rerender 自动播放新分类第一题
      rerender(root, false);
    });
  });

  const play = (): void => {
    const item = state.pool[state.index];
    if (item) void playCurrent(item.id);
  };
  root.querySelectorAll<HTMLButtonElement>('[data-play], [data-replay]').forEach((btn) => {
    btn.addEventListener('click', play);
  });

  root.querySelector<HTMLButtonElement>('[data-reload]')?.addEventListener('click', () => {
    if (state.loading) return;
    state.loaded = false;
    rerender(root, false);
  });

  root.querySelector<HTMLButtonElement>('[data-mic]')?.addEventListener('click', () => {
    toast('本页语音输入尚未接入，请键盘输入；情境对话页支持录音', { pending: true });
  });

  const submitBtn = root.querySelector<HTMLButtonElement>('#submit-answer');
  if (submitBtn) submitBtn.addEventListener('click', () => void submitAnswer(root));
  root.querySelector<HTMLInputElement>('#listen-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submitAnswer(root);
  });
}
