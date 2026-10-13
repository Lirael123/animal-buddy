import { ASSETS } from '../assets';
import { toast, pendingBadge, playAudio } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';
import { recognizeSpeech, synthesizeSpeech, askAgent, recordTalk } from '../api/client';

interface Line {
  speaker: 'rex' | 'me';
  en: string;
  zh?: string;
  isUser?: boolean;
}
interface Scene {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  page: string;
  img: string;
  caption: string;
  lines: Line[];
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
    lines: [
      { speaker: 'rex', en: 'Hi! Do you have a pet?' },
      { speaker: 'me', en: 'Yes, I do.', isUser: true },
      { speaker: 'rex', en: 'Great! What pet do you have?' },
    ],
  },
  {
    key: 'zoo',
    emoji: '🦒',
    title: 'At the Zoo',
    sub: '动物园',
    page: 'P31　Part B　Let’s talk',
    img: ASSETS.sceneZoo,
    caption: 'What can we see at the zoo?',
    lines: [
      { speaker: 'rex', en: 'Look! What animal is it?' },
      { speaker: 'me', en: "It's a giraffe. It's so tall!", isUser: true },
      { speaker: 'rex', en: "And that's a panda. How cute!" },
    ],
  },
];

const state = {
  scene: 0,
  recording: false,
  showKeyboard: false,
  busy: false, // Agent 回复中
  assistantAudio: '', // 最近一次 Agent 回复的 TTS 音频 URL（用于重听）
};

/** 动态对话历史：用教材预置 + 学生/Agent 真实回合 */
let live: Line[] = [];

function insertUserLine(text: string): void {
  live.push({ speaker: 'me', en: text, isUser: true });
}
function insertAgentLine(text: string): void {
  live.push({ speaker: 'rex', en: text });
}

/** 把语音 / 文本送去 Agent，得到英语回复并转语音 */
async function runAgent(text: string, scene: string): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  const history: { role: 'user' | 'assistant'; content: string }[] = live
    .filter(l => l.en)
    .map(l => ({ role: l.speaker === 'rex' ? 'assistant' : 'user', content: l.en }));
  try {
    toast('外教正在组织回复…');
    const { reply } = await askAgent(text, scene, history);
    insertAgentLine(reply);
    const audio = await synthesizeSpeech(reply);
    state.assistantAudio = audio.audioUri;
    await recordTalk({ scene, role: 'assistant', text: reply });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Agent 回复失败', { pending: true });
  } finally {
    state.busy = false;
  }
}

function eqBars(n: number, idle = false): string {
  return Array.from({ length: n })
    .map((_, i) => `<span class="eq-bar ${idle ? 'idle' : ''} h-7" style="animation-delay:${i * 0.08}s"></span>`)
    .join('');
}

function displayLines(): Line[] {
  return live.length ? live : SCENES[state.scene].lines;
}

function bubbles(): string {
  return displayLines()
    .map((l, i) => {
      const rex = l.speaker === 'rex';
      return `
      <div class="flex ${rex ? '' : 'flex-row-reverse'} items-start gap-2.5 animate-fade-slide-up" style="animation-delay:${i * 70}ms">
        <img src="${rex ? ASSETS.bunnyHero : ASSETS.avatarBoy}" alt="" class="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm" loading="lazy" width="44" height="44" />
        <div class="flex ${rex ? '' : 'flex-row-reverse'} items-center gap-2">
          <div class="max-w-[78%] rounded-3xl ${rex ? 'rounded-tl-md bg-white' : 'rounded-tr-md bg-sky-pale'} px-4 py-2.5 shadow-sm">
            <p class="text-xl font-bold leading-snug text-ink">${l.en}</p>
            ${l.zh ? `<p class="mt-0.5 text-sm text-ink/45">${l.zh}</p>` : ''}
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
          <p class="mb-3 flex items-center gap-2 text-base font-bold text-ink/55">
            ${s.page}
            <span class="rounded-full bg-grass px-2.5 py-0.5 text-xs font-bold text-white">Agent 已联通</span>
          </p>
          <div id="talk-list" class="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            ${bubbles()}
            ${state.busy ? '<div class="flex items-center gap-2 text-ink/50"><span class="eq-bar idle h-5"></span><span class="eq-bar idle h-5"></span><span class="eq-bar idle h-5"></span> 外教回复中…</div>' : ''}
          </div>

          ${pendingBadge('待接入')}
          <span class="mt-1 text-xs text-ink/50">教材原声(Unit 3 MP3)与知识库资源暂不可达，此处显示真实 Agent/语音结果。</span>

          <!-- 键盘输入（点「键盘输入」时出现） -->
          <div id="keyboard-box" class="${state.showKeyboard ? '' : 'hidden'} mt-3">
            <div class="flex gap-2">
              <input id="key-input" type="text" placeholder="输入你想说的英语句子…"
                class="w-full rounded-2xl border-2 border-grass-soft bg-white px-4 py-3 text-lg font-semibold text-ink outline-none focus:border-grass" />
              <button data-send class="pressable shrink-0 rounded-2xl bg-grass px-5 text-lg font-extrabold text-white">发送</button>
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
  root.innerHTML = renderTalk();
  bindTalk(root);
  const list = document.getElementById('talk-list');
  list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
}

/** WebM/WebAudio → wav(16bit PCM) base64，供后端 ASR 识别 */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
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
  await ctx.close();
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function bindTalk(root: HTMLElement): void {
  bindShell(root);

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.scene = SCENES.findIndex(sc => sc.key === btn.dataset.side);
      state.showKeyboard = false;
      state.assistantAudio = '';
      live = []; // 切换场景重置对话
      rerender(root);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.speak);
      const lines = displayLines();
      const text = lines[i]?.en;
      if (!text) return;
      // 用户句子用后端 TTS；教材/Agent 行若已有音频则播放，否则 TTS
      if (lines[i].isUser) {
        void synthesizeSpeech(text).then(r => playAudio(r.audioUri)).catch(() => toast('合成失败'));
      } else if (i === displayLines().length - 1 && state.assistantAudio) {
        playAudio(state.assistantAudio);
      } else {
        void synthesizeSpeech(text).then(r => playAudio(r.audioUri)).catch(() => toast('合成失败'));
      }
    });
  });

  root.querySelector('[data-original]')?.addEventListener('click', () => {
    toast('教材原声(Unit 3 MP3)资源当前不可达，未接入', { pending: true });
  });

  root.querySelector('[data-keyboard]')?.addEventListener('click', () => {
    state.showKeyboard = !state.showKeyboard;
    rerender(root);
    if (state.showKeyboard) document.getElementById('key-input')?.focus();
  });

  root.querySelector('[data-send]')?.addEventListener('click', () => submitKeyboard());
  document.getElementById('key-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitKeyboard();
  });

  async function submitKeyboard(): Promise<void> {
    const input = document.getElementById('key-input') as HTMLInputElement | null;
    const v = (input?.value ?? '').trim();
    if (!v) return;
    if (input) input.value = '';
    state.showKeyboard = false;
    insertUserLine(v);
    await recordTalk({ scene: SCENES[state.scene].key, role: 'user', text: v }).catch(() => toast('记录失败'));
    rerender(root);
    await runAgent(v, SCENES[state.scene].key);
    rerender(root);
    if (state.assistantAudio) playAudio(state.assistantAudio);
  }

  root.querySelector('[data-replay]')?.addEventListener('click', () => {
    if (state.assistantAudio) {
      playAudio(state.assistantAudio);
      toast('重听外教回复');
    } else {
      toast('还没有可重听的 Agent 回复，先说一句吧', { pending: true });
    }
  });

  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    state.showKeyboard = false;
    state.assistantAudio = '';
    live = [];
    toast('已清空本轮对话');
    rerender(root);
  });

  // 麦克风：录音 → WAV → 真实 ASR → Agent → TTS → 播放 + 记录
  root.querySelector('[data-mic]')?.addEventListener('click', async () => {
    if (state.recording && recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }
    if (state.busy) {
      toast('外教正在回复，请稍候');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.length = 0;
      recorder.ondataavailable = ev => chunks.push(ev.data);
      recorder.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        state.recording = false;
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        rerender(root);
        try {
          toast('正在识别你的声音…');
          const base64 = await blobToWavBase64(blob);
          const scene = SCENES[state.scene].key;
          const { text } = await recognizeSpeech({ base64 });
          if (!text || !text.trim()) {
            toast('没有听清，再说一次好吗？', { pending: true });
            return;
          }
          insertUserLine(text);
          await recordTalk({ scene, role: 'user', text }).catch(() => toast('记录失败'));
          rerender(root);
          await runAgent(text, scene);
          rerender(root);
          if (state.assistantAudio) playAudio(state.assistantAudio);
        } catch (e) {
          toast(e instanceof Error ? `${e.message}` : '语音识别失败', { pending: true });
        }
      };
      recorder.start();
      state.recording = true;
      rerender(root);
    } catch {
      toast('请允许使用麦克风后再练习');
    }
  });
}