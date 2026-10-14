import { ASSETS } from '../assets';
import { toast, pendingBadge, playAudio, stopAudio, escapeHtml } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';
import {
  recognizeSpeech,
  synthesizeSpeech,
  askAgent,
  startTalkScene,
  recordTalk,
  fetchUnitAudio,
  fetchServiceStatus,
  type ChatResult,
  type TutorVerdict,
} from '../api/client';

interface Line {
  speaker: 'rex' | 'me';
  en: string;
  zh?: string;
  isUser?: boolean;
  audio?: string;
  /** Rex 行携带的结构化教学反馈（来自内置工作流） */
  verdict?: TutorVerdict;
  page?: number;
  modelAnswer?: string;
}
interface Scene {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  page: string;
  img: string;
  caption: string;
  /** 服务端开场接口失败时的本地兜底第一问 */
  openingFallback: string;
  /** 内置教学工作流是否已开放（第一阶段仅 My Pet 真实可用） */
  tutorEnabled: boolean;
  /** 本场景可播放的教材原声（audio.ts 的 U03_xx id，真实 MP3） */
  audioIds: string[];
}

const SCENES: Scene[] = [
  {
    key: 'pet',
    emoji: '🐶',
    title: 'My Pet',
    sub: '我的宠物',
    page: 'P28　Part A　Let’s talk',
    img: ASSETS.scenePet,
    caption: 'Do you have a pet?',
    openingFallback: 'Good morning! Do you have a pet?',
    tutorEnabled: true,
    audioIds: ['U03_03', 'U03_01', 'U03_02'],
  },
  {
    key: 'zoo',
    emoji: '🦒',
    title: 'At the Zoo',
    sub: '动物园',
    page: 'P32　Part B　Let’s learn / P33',
    img: ASSETS.sceneZoo,
    caption: 'Look! What animal is it?',
    openingFallback: 'Hello! What animals do you see at the zoo?',
    tutorEnabled: true, // 第二阶段 2B 已接入真实工作流
    audioIds: ['U03_07', 'U03_08', 'U03_09'],
  },
];

const state = {
  scene: 0,
  recording: false,
  showKeyboard: false,
  busy: false, // 智能体回复中
  starting: false,
  micPending: false,
  processing: false,
  serviceLabel: '正在检查服务…', // 正在向服务端取开场问题
  assistantAudio: '', // 最近一次智能体回复的 TTS 音频 URL（用于重听）
};

/** 动态对话历史：开场问题 + 学生/智能体真实回合 */
let live: Line[] = [];
/** 最近一次结构化教学反馈（用于学习反馈区） */
let lastFeedback: ChatResult | null = null;
/** 每个场景是否已从服务端取过开场，避免重复初始化 */
const initialized = new Set<string>();
/** 正在拉取开场的场景（重入保护，防止 rerender→bindTalk→initScene 同步递归） */
const initializing = new Set<string>();
let revision = 0;
let active = false;
let serviceChecked = false;
function current(value: number): boolean { return active && value === revision; }

function insertUserLine(text: string): void {
  live.push({ speaker: 'me', en: text, isUser: true });
}
function insertAgentLine(reply: string, zh: string, fb?: ChatResult): void {
  live.push({
    speaker: 'rex',
    en: reply,
    zh: zh || undefined,
    verdict: fb?.verdict,
    page: fb?.page,
    modelAnswer: fb?.correction?.modelAnswer,
  });
}

/** 进入/重置场景：向服务端教学工作流取教材脚本的开场问题 */
async function initScene(root: HTMLElement, sceneKey: string): Promise<void> {
  if (initialized.has(sceneKey) || initializing.has(sceneKey)) return;
  const version = revision;
  initializing.add(sceneKey);
  state.starting = true;
  rerender(root);
  try {
    const opened = await startTalkScene(sceneKey, true);
    if (!current(version)) return;
    live = [{ speaker: 'rex', en: opened.opening, zh: opened.openingZh, page: opened.page }];
    initialized.add(sceneKey);
  } catch (e) {
    if (!current(version)) return;
    const fallback = SCENES.find(s => s.key === sceneKey)?.openingFallback ?? 'Do you have a pet?';
    live = [{ speaker: 'rex', en: fallback, page: sceneKey === 'zoo' ? 31 : 28 }];
    initialized.add(sceneKey);
    toast(e instanceof Error ? `开场获取失败：${e.message}` : '开场获取失败', { pending: true });
  } finally {
    if (current(version)) {
      initializing.delete(sceneKey);
      state.starting = false;
      rerender(root);
    }
  }
}

/** Display feedback before waiting on TTS; persistence never blocks the lesson. */
async function runAgent(root: HTMLElement, text: string, scene: string): Promise<void> {
  if (state.busy || state.starting || lastFeedback?.finished) return;
  const version = revision;
  state.busy = true;
  state.assistantAudio = '';
  insertUserLine(text);
  const history = live.filter(l => l.en).slice(-6)
    .map(l => ({ role: l.speaker === 'rex' ? 'assistant' as const : 'user' as const, content: l.en }));
  rerender(root);
  void recordTalk({ scene, role: 'user', text }).catch(() => {
    if (current(version)) toast('学习记录暂未保存，仍可继续练习');
  });
  try {
    const fb = await askAgent(text, scene, history);
    if (!current(version)) return;
    lastFeedback = fb;
    state.serviceLabel = fb.replySource === 'script' ? '教材工作流可用 · 模型暂不可用' : '教学工作流与模型已响应';
    insertAgentLine(fb.reply, fb.replyZh, fb);
    const line = live[live.length - 1];
    state.busy = false;
    rerender(root);
    void recordTalk({ scene, role: 'assistant', text: fb.reply,
      expected: fb.matchedPattern || fb.question,
      correction: fb.correction ? `${escapeHtml(fb.correction.issue)}｜示范：${escapeHtml(fb.correction.modelAnswer)}` : undefined,
      errorType: fb.errorType, round: fb.round, page: fb.page,
      attempt: fb.correction?.attempt, finished: fb.finished,
    }).catch(() => { if (current(version)) toast('学习记录暂未保存，仍可继续练习'); });
    void synthesizeSpeech(fb.reply).then(audio => {
      if (!current(version) || live[live.length - 1] !== line) return;
      line.audio = audio.audioUri;
      state.assistantAudio = audio.audioUri;
      void playAudio(audio.audioUri);
    }).catch(() => { if (current(version)) toast('云端语音暂不可用，可阅读回复或稍后点击喇叭重试'); });
  } catch (e) {
    if (current(version)) toast(e instanceof Error ? e.message : '智能体回复失败', { pending: true });
  } finally {
    if (current(version)) { state.busy = false; rerender(root); }
  }
}

/** 学习反馈卡：正误 / 轮次 / 教材页码 / 纠错提示 */
function feedbackCard(): string {
  if (!lastFeedback) {
    return `
      <div class="mt-3 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/5">
        <p class="text-base font-bold text-ink/70">🌟 学习反馈</p>
        <p class="mt-1 text-sm text-ink/55">对着麦克风回答 Rex 的问题，这里会给出判定、小提示和教材页码。</p>
      </div>`;
  }
  const fb = lastFeedback;
  const ok = fb.verdict === 'correct';
  const badge = ok
    ? '<span class="rounded-full bg-grass px-3 py-1 text-sm font-extrabold text-white">✅ 说得好</span>'
    : fb.verdict === 'incorrect'
      ? '<span class="rounded-full bg-orange px-3 py-1 text-sm font-extrabold text-white">✏️ 再试一次</span>'
      : '<span class="rounded-full bg-wood px-3 py-1 text-sm font-extrabold text-ink">💡 补全句子</span>';
  const correctionBlock = fb.correction
    ? `
      <p class="mt-2 text-sm font-semibold text-ink/80">${escapeHtml(fb.correction.issue)}</p>
      ${fb.correction.attempt >= 2 ? `<p class="mt-1 text-sm font-extrabold text-grass-dark">跟读示范：${escapeHtml(fb.correction.modelAnswer)}</p>` : ''}`
    : '';
  const asrBlock = fb.asrNote
    ? `<p class="mt-2 rounded-xl bg-wood/60 px-3 py-2 text-sm font-bold text-ink/80">🎙️ ${escapeHtml(fb.asrNote)}</p>`
    : '';
  const sourceLabel = fb.sourceKind === 'textbook' ? '教材原句' : '教材句型表达';
  return `
  <div class="mt-3 rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/5">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-base font-extrabold text-ink/80">🌟 学习反馈</p>
      ${badge}
      <span class="rounded-full bg-mint-pale px-3 py-1 text-xs font-bold text-ink/70">第 ${fb.round} 轮</span>
      <span class="rounded-full bg-sky-pale px-3 py-1 text-xs font-bold text-ink/70">P${fb.page} · ${sourceLabel}</span>
      ${fb.finished ? '<span class="rounded-full bg-grass px-3 py-1 text-xs font-extrabold text-white">本轮完成 🎉</span>' : ''}
    </div>
    ${fb.replyZh ? `<p class="mt-2 text-sm font-semibold text-ink/75">${escapeHtml(fb.replyZh)}</p>` : ''}
    ${correctionBlock}
    ${asrBlock}
  </div>`;
}

function eqBars(n: number, idle = false): string {
  return Array.from({ length: n })
    .map((_, i) => `<span class="eq-bar ${idle ? 'idle' : ''} h-7" style="animation-delay:${i * 0.08}s"></span>`)
    .join('');
}

function displayLines(): Line[] {
  return live;
}

function verdictTag(l: Line): string {
  if (!l.verdict) return '';
  if (l.verdict === 'correct') return '<span class="mr-1 text-grass">✅</span>';
  if (l.verdict === 'incorrect') return '<span class="mr-1 text-orange">✏️</span>';
  return '<span class="mr-1 text-wood">💡</span>';
}

function bubbles(): string {
  const lines = displayLines();
  if (!lines.length) {
    return `<div class="grid flex-1 place-items-center text-ink/45">
      <p class="text-lg font-bold">${state.starting ? 'Rex 正在准备问题…' : '点击下方麦克风开始和 Rex 对话'}</p>
    </div>`;
  }
  return lines
    .map((l, i) => {
      const rex = l.speaker === 'rex';
      return `
      <div class="flex ${rex ? '' : 'flex-row-reverse'} items-start gap-2.5 animate-fade-slide-up" style="animation-delay:${Math.min(i, 4) * 30}ms">
        <img src="${rex ? ASSETS.bunnyHero : ASSETS.avatarBoy}" alt="" class="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm" loading="lazy" width="44" height="44" />
        <div class="flex ${rex ? '' : 'flex-row-reverse'} items-center gap-2">
          <div class="max-w-[78%] rounded-3xl ${rex ? 'rounded-tl-md bg-white' : 'rounded-tr-md bg-sky-pale'} px-4 py-2.5 shadow-sm">
            <p class="text-xl font-bold leading-snug text-ink">${verdictTag(l)}${escapeHtml(l.en)}</p>
            ${l.zh ? `<p class="mt-0.5 text-sm text-ink/55">${escapeHtml(l.zh)}</p>` : ''}
            ${l.page ? `<p class="mt-1 text-xs font-semibold text-ink/35">Unit 3 · P${l.page}</p>` : ''}
          </div>
          <button data-speak="${i}" class="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-grass text-white shadow-sm">🔊</button>
        </div>
      </div>`;
    })
    .join('');
}

export function renderTalk(): string {
  const s = SCENES[state.scene];

  const side: SideItem[] = SCENES.map(sc => ({
    key: sc.key,
    emoji: sc.emoji,
    title: sc.title,
    sub: sc.sub,
  }));

  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '💬', emojiBg: 'bg-orange-light', title: "Let's Talk", subtitle: '情境对话' })}

    <main class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <div class="flex flex-col gap-5 lg:flex-row">
        <!-- 左侧：场景 + 教材图 -->
        <div class="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
          ${sideMenu(side, s.key)}
          <div class="relative overflow-hidden rounded-[1.75rem] shadow-card ring-1 ring-black/5">
            <img src="${s.img}" alt="${s.title} 教材场景图" class="aspect-[3/4] w-full object-cover" width="600" height="800" fetchpriority="high" />
            <div class="absolute inset-x-3 bottom-16 rounded-2xl bg-white/92 px-4 py-2.5 text-center shadow-md backdrop-blur">
              <span class="mr-2 text-grass">🔊</span>
              <span class="text-lg font-bold text-ink">${s.caption}</span>
            </div>
            <button data-original class="pressable absolute inset-x-6 bottom-4 flex items-center justify-center gap-2 rounded-full bg-grass py-3 text-lg font-extrabold text-white shadow-float">
              <span>🎧</span> 听教材原声
            </button>
          </div>
        </div>

        <!-- 右侧：对话 -->
        <section class="flex min-h-[420px] flex-1 flex-col rounded-[1.75rem] bg-gradient-to-b from-sky-pale to-mint-pale p-4 shadow-card ring-1 ring-black/5 sm:p-5">
          <p class="mb-3 flex flex-wrap items-center gap-2 text-base font-bold text-ink/55">
            ${s.page}
            ${s.tutorEnabled
              ? `<span class="rounded-full bg-grass px-2.5 py-0.5 text-xs font-bold text-white">${escapeHtml(state.serviceLabel)}</span>`
              : '<span class="rounded-full bg-orange px-2.5 py-0.5 text-xs font-bold text-white">第二阶段开放</span>'}
            <span class="rounded-full bg-mint-pale px-2.5 py-0.5 text-xs font-bold text-ink/60">语音需云端服务响应</span>
          </p>
          <div id="talk-list" class="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            ${bubbles()}
            ${state.busy ? '<div class="flex items-center gap-2 text-ink/50"><span class="eq-bar idle h-5"></span><span class="eq-bar idle h-5"></span><span class="eq-bar idle h-5"></span> Rex 思考中…</div>' : ''}
          </div>

          ${s.tutorEnabled ? feedbackCard() : pendingBadge('At the Zoo 场景教学工作流第二阶段接入')}

          <!-- 键盘输入（点「键盘输入」时出现） -->
          <div id="keyboard-box" class="${state.showKeyboard ? '' : 'hidden'} mt-3">
            <div class="flex gap-2">
              <input id="key-input" type="text" placeholder="输入你想说的英语句子…"
                class="w-full rounded-2xl border-2 border-grass-soft bg-white px-4 py-3 text-lg font-semibold text-ink outline-none focus:border-grass" />
              <button data-send ${state.busy || state.starting || state.processing || state.recording || lastFeedback?.finished ? 'disabled' : ''} class="pressable shrink-0 rounded-2xl bg-grass px-5 text-lg font-extrabold text-white">发送</button>
            </div>
          </div>
        </section>
      </div>

      <!-- 底部语音控制条 -->
      <div class="rounded-[1.75rem] bg-white/90 p-4 shadow-card ring-1 ring-black/5">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <button data-keyboard class="pressable flex items-center gap-2 rounded-2xl bg-mint-pale px-5 py-3 text-lg font-extrabold text-ink">
            <span class="text-xl">⌨️</span> 键盘输入
          </button>

          <div class="order-3 flex w-full items-center justify-center gap-3 sm:order-none sm:w-auto">
            <span class="flex h-8 items-end gap-1">${eqBars(6, !state.recording)}</span>
            <button data-mic class="pressable grid h-20 w-20 place-items-center rounded-full bg-grass text-4xl text-white shadow-float ring-4 ring-white ${state.recording ? 'animate-breathe' : ''}">🎤</button>
            <span class="flex h-8 items-end gap-1">${eqBars(6, !state.recording)}</span>
          </div>

          <div class="flex items-center gap-3">
            <button data-replay class="pressable flex items-center gap-2 rounded-2xl bg-mint-pale px-5 py-3 text-lg font-extrabold text-ink">
              <span>▶️</span> 重听
            </button>
            <button data-clear class="pressable flex items-center gap-2 rounded-2xl bg-mint-pale px-5 py-3 text-lg font-extrabold text-ink">
              <span>🗑️</span> 清空
            </button>
          </div>
        </div>
        <p class="mt-3 text-center text-base font-bold text-ink/55">
          ${state.recording ? '正在聆听…再点一次麦克风结束并识别' : state.busy ? '外教正在回复…' : '点击麦克风，说出你的英语'}
        </p>
      </div>
    </main>
  </div>`;
}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
const chunks: BlobPart[] = [];

function rerender(root: HTMLElement): void {
  if (!active) return;
  root.innerHTML = renderTalk();
  bindTalk(root);
  const list = document.getElementById('talk-list');
  list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
}

/** WebM/WebAudio → wav(16bit PCM) base64，供后端 ASR 识别 */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  const samples = audioBuf.getChannelData(0);
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ctx.sampleRate, true);
  view.setUint32(28, ctx.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
  } finally { await ctx.close(); }
}

/** 申请麦克风，带 8s 超时，避免权限请求在部分设备上既不 resolve 也不 reject 而卡死 */
async function getMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持麦克风录音，请使用键盘输入');
  }
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('麦克风开启超时，请检查权限后重试')); }, 8000);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
      clearTimeout(timer);
      if (settled) { s.getTracks().forEach(track => track.stop()); return; }
      settled = true;
      resolve(s);
    }).catch(e => { clearTimeout(timer); settled = true; reject(e); });
  });
}

let recordTimer: ReturnType<typeof setTimeout> | undefined;
export function cleanupTalk(): void {
  active = false;
  revision++;
  if (recordTimer) clearTimeout(recordTimer);
  if (recorder) {
    recorder.onstop = null;
    recorder.ondataavailable = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }
  stream?.getTracks().forEach(track => track.stop());
  recorder = null;
  stream = null;
  chunks.length = 0;
  state.recording = state.busy = state.starting = state.micPending = state.processing = false;
  state.assistantAudio = '';
  initialized.clear();
  initializing.clear();
  live = [];
  lastFeedback = null;
  stopAudio();
}

export function bindTalk(root: HTMLElement): void {
  active = true;
  bindShell(root);
  if (!serviceChecked) {
    serviceChecked = true;
    const version = revision;
    void fetchServiceStatus().then(status => {
      if (!current(version)) return;
      state.serviceLabel = status.cloudConfigured ? '教材工作流可用 · 云端待验证' : '教材工作流可用 · 云端未配置';
      rerender(root);
    }).catch(() => { if (current(version)) { state.serviceLabel = '服务暂不可用，请检查网络'; rerender(root); } });
  }

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = SCENES.findIndex(sc => sc.key === btn.dataset.side);
      if (idx < 0 || idx === state.scene) return;
      cleanupTalk();
      state.scene = idx;
      state.showKeyboard = false;
      active = true;
      rerender(root);
    });
  });

  const scene = SCENES[state.scene];
  void initScene(root, scene.key);

  root.querySelectorAll<HTMLButtonElement>('[data-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      const line = live[Number(btn.dataset.speak)];
      if (!line) return;
      if (line.audio) { void playAudio(line.audio); return; }
      const version = revision;
      btn.disabled = true;
      void synthesizeSpeech(line.en).then(result => {
        if (!current(version)) return;
        line.audio = result.audioUri;
        void playAudio(result.audioUri);
      }).catch(() => { if (current(version)) toast('云端语音合成失败，请稍后重试'); })
        .finally(() => { btn.disabled = false; });
    });
  });

  root.querySelector<HTMLButtonElement>('[data-original]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;
    button.disabled = true;
    const version = revision;
    try {
      const audio = await fetchUnitAudio(scene.audioIds[0]);
      if (current(version) && audio.url) await playAudio(audio.url);
    } catch (e) {
      if (current(version)) toast(e instanceof Error ? e.message : '教材原声播放失败');
    } finally { button.disabled = false; }
  });

  root.querySelector('[data-keyboard]')?.addEventListener('click', () => {
    state.showKeyboard = !state.showKeyboard;
    rerender(root);
    if (state.showKeyboard) root.querySelector<HTMLInputElement>('#key-input')?.focus();
  });
  const submitKeyboard = (): void => {
    if (state.busy || state.starting || state.processing || state.recording || lastFeedback?.finished) return;
    const input = root.querySelector<HTMLInputElement>('#key-input');
    const value = (input?.value || '').trim();
    if (!value) return;
    if (input) input.value = '';
    state.showKeyboard = false;
    void runAgent(root, value, scene.key);
  };
  root.querySelector('[data-send]')?.addEventListener('click', submitKeyboard);
  root.querySelector('#key-input')?.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key === 'Enter') submitKeyboard();
  });
  root.querySelector('[data-replay]')?.addEventListener('click', () => {
    const last = [...live].reverse().find(line => line.speaker === 'rex');
    if (last?.audio) void playAudio(last.audio);
    else if (last) {
      const version = revision;
      void synthesizeSpeech(last.en).then(result => { if (current(version)) void playAudio(result.audioUri); })
        .catch(() => { if (current(version)) toast('云端语音合成失败，请稍后重试'); });
    }
  });
  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    cleanupTalk();
    active = true;
    rerender(root);
  });

  root.querySelector('[data-mic]')?.addEventListener('click', async () => {
    if (state.recording && recorder?.state !== 'inactive') { recorder?.stop(); return; }
    if (state.busy || state.starting || state.processing || state.micPending || lastFeedback?.finished) return;
    const version = revision;
    state.micPending = true;
    try {
      const microphone = await getMicStream();
      if (!current(version)) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream = microphone;
      const mime = ['audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(microphone, mime ? { mimeType: mime } : undefined);
      recorder = recording;
      chunks.length = 0;
      recording.ondataavailable = event => chunks.push(event.data);
      recording.onstop = async () => {
        if (recordTimer) clearTimeout(recordTimer);
        microphone.getTracks().forEach(track => track.stop());
        if (!current(version)) return;
        state.recording = false;
        state.processing = true;
        const blob = new Blob(chunks, { type: recording.mimeType });
        rerender(root);
        try {
          const base64 = await blobToWavBase64(blob);
          if (!current(version)) return;
          const result = await recognizeSpeech({ base64 });
          if (!current(version)) return;
          state.processing = false;
          if (!result.text.trim()) { toast('没有听清，请再说一次'); return; }
          await runAgent(root, result.text, scene.key);
        } catch (e) {
          if (current(version)) toast(e instanceof Error ? e.message : '语音识别失败');
        } finally { if (current(version)) { state.processing = false; rerender(root); } }
      };
      recording.start();
      state.recording = true;
      recordTimer = setTimeout(() => { if (recording.state !== 'inactive') recording.stop(); }, 30000);
      rerender(root);
    } catch (e) {
      stream?.getTracks().forEach(track => track.stop());
      if (current(version)) toast(e instanceof Error ? e.message : '麦克风开启失败');
    } finally { if (current(version)) state.micPending = false; }
  });
}
