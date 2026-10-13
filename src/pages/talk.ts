import { ASSETS } from '../assets';
import { toast } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';

interface Line {
  speaker: 'rex' | 'me';
  en: string;
  zh: string;
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
      { speaker: 'rex', en: 'Hi! Do you have a pet?', zh: '你有宠物吗？' },
      { speaker: 'me', en: 'Yes, I do.', zh: '是的，我有。' },
      { speaker: 'rex', en: 'Great! What pet do you have?', zh: '太棒了！你有什么宠物？' },
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
      { speaker: 'rex', en: 'Look! What animal is it?', zh: '快看！那是什么动物？' },
      { speaker: 'me', en: "It's a giraffe. It's so tall!", zh: '是长颈鹿。它好高呀！' },
      { speaker: 'rex', en: "And that's a panda. How cute!", zh: '那边还有熊猫。真可爱！' },
    ],
  },
];

const state = { scene: 0, recording: false, showKeyboard: false };

function speak(text: string): void {
  if (!('speechSynthesis' in window)) {
    toast('当前浏览器不支持语音朗读');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  } catch {
    toast('语音朗读暂不可用');
  }
}

function bubbles(lines: Line[]): string {
  return lines
    .map((l, i) => {
      const rex = l.speaker === 'rex';
      return `
      <div class="flex ${rex ? '' : 'flex-row-reverse'} items-start gap-2.5 animate-fade-slide-up" style="animation-delay:${i * 90}ms">
        <img src="${rex ? ASSETS.bunnyHero : ASSETS.avatarBoy}" alt="" class="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm" loading="lazy" width="44" height="44" />
        <div class="flex ${rex ? '' : 'flex-row-reverse'} items-center gap-2">
          <div class="max-w-[78%] rounded-3xl ${rex ? 'rounded-tl-md bg-white' : 'rounded-tr-md bg-sky-pale'} px-4 py-2.5 shadow-sm">
            <p class="text-xl font-bold leading-snug text-ink">${l.en}</p>
            <p class="mt-0.5 text-sm text-ink/45">${l.zh}</p>
          </div>
          <button data-speak="${i}" class="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-grass text-white shadow-sm">🔊</button>
        </div>
      </div>`;
    })
    .join('');
}

function eqBars(n: number, idle = false): string {
  return Array.from({ length: n })
    .map((_, i) => `<span class="eq-bar ${idle ? 'idle' : ''} h-7" style="animation-delay:${i * 0.08}s"></span>`)
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
          <p class="mb-3 text-base font-bold text-ink/55">${s.page}</p>
          <div class="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            ${bubbles(s.lines)}
          </div>

          <!-- 键盘输入（点「键盘输入」时出现） -->
          <div id="keyboard-box" class="${state.showKeyboard ? '' : 'hidden'} mt-3">
            <input id="key-input" type="text" placeholder="输入你想说的英语句子…"
              class="w-full rounded-2xl border-2 border-grass-soft bg-white px-4 py-3 text-lg font-semibold text-ink outline-none focus:border-grass" />
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
          ${state.recording ? '正在聆听，再点一次麦克风结束录音…' : '点击麦克风，开始说英语'}
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
}

export function bindTalk(root: HTMLElement): void {
  bindShell(root);

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.scene = SCENES.findIndex(sc => sc.key === btn.dataset.side);
      state.showKeyboard = false;
      rerender(root);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.speak);
      speak(SCENES[state.scene].lines[i].en);
    });
  });

  root.querySelector('[data-original]')?.addEventListener('click', () => {
    toast('教材原声将在接入录音资源后启用', { pending: true });
  });

  root.querySelector('[data-keyboard]')?.addEventListener('click', () => {
    state.showKeyboard = !state.showKeyboard;
    rerender(root);
    if (state.showKeyboard) {
      document.getElementById('key-input')?.focus();
    }
  });

  root.querySelector('[data-replay]')?.addEventListener('click', () => {
    speak(SCENES[state.scene].lines[0].en);
    toast('重听：当前播放浏览器示例朗读，教材音频待接入', { pending: true });
  });

  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    state.showKeyboard = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    toast('已清空本轮练习');
    rerender(root);
  });

  // 键盘提交：回车朗读输入内容（浏览器 TTS 演示）
  document.getElementById('key-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) {
        speak(v);
        toast('已朗读你的句子（浏览器示例 TTS）');
      }
    }
  });

  // 麦克风：真实录音采集，识别由待接入 ASR 完成
  root.querySelector('[data-mic]')?.addEventListener('click', async () => {
    if (state.recording && recorder && recorder.state !== 'inactive') {
      recorder.stop();
      state.recording = false;
      rerender(root);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = 'audio/webm';
      recorder = new MediaRecorder(stream, { mimeType: mime });
      chunks.length = 0;
      recorder.ondataavailable = ev => chunks.push(ev.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        void URL.createObjectURL(blob);
        stream?.getTracks().forEach(t => t.stop());
        toast('已录下你的声音，ASR 识别将在接入 Agent 后启用', { pending: true });
      };
      recorder.start();
      state.recording = true;
      rerender(root);
    } catch {
      toast('请允许使用麦克风后再练习');
    }
  });
}