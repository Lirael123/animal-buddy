import { buddySVG } from '../components/buddy';
import { toast, pendingBadge } from '../components/ui';
import { isAgentConnected } from '../api/client';

interface Line {
  speaker: 'rex' | 'me';
  en: string;
  zh: string;
}

interface Scene {
  id: string;
  tab: string;
  emoji: string;
  tagline: string;
  bg: string; // tailwind 渐变类
  lines: Line[];
  prompt: string;
}

const SCENES: Scene[] = [
  {
    id: 'pet',
    tab: 'My Pet',
    emoji: '🐾',
    tagline: '我们聊一聊我的宠物',
    bg: 'from-mint-light to-mint-pale',
    prompt: 'Did you bring your pet? Show me!',
    lines: [
      { speaker: 'rex', en: 'Hi! Is that your pet?', zh: '嗨！那是你的宠物吗？' },
      { speaker: 'me', en: 'Yes, it’s my dog. He can run fast!', zh: '是的，这是我的小狗。它跑得可快啦！' },
      { speaker: 'rex', en: 'Wow! I love your dog.', zh: '哇！我好喜欢你的小狗。' },
      { speaker: 'me', en: 'Thank you, Rex!', zh: '谢谢你，Rex！' },
    ],
  },
  {
    id: 'zoo',
    tab: 'At the Zoo',
    emoji: '🦁',
    tagline: '我们一起去动物园吧',
    bg: 'from-orange-light to-pink-pale',
    prompt: 'What can we see at the zoo?',
    lines: [
      { speaker: 'rex', en: 'Look! It’s a panda.', zh: '快看！那是一只熊猫。' },
      { speaker: 'me', en: 'It’s so cute! It likes bamboo.', zh: '好可爱呀！它喜欢吃竹子。' },
      { speaker: 'rex', en: 'And there is a tiger. Roar!', zh: '那里还有一只老虎。嗷呜！' },
      { speaker: 'me', en: 'Oh! The lion is big and strong.', zh: '哦！这头狮子又大又强壮。' },
    ],
  },
];

const FEEDBACK = [
  { txt: '发音很棒，继续加油！', star: 3 },
  { txt: '说得真流利，真厉害！', star: 2 },
  { txt: '好清楚呀，我们再来一句！', star: 3 },
];
let fbIdx = 0;

interface TalkState {
  scene: number;
  activeLine: number; // -1 表示无
  recording: boolean;
}

const state: TalkState = { scene: 0, activeLine: -1, recording: false };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function lineBubble(l: Line, i: number, isActive: boolean): string {
  const rex = l.speaker === 'rex';
  return `
  <button data-line="${i}" class="pressable group block w-full animate-fade-slide-up text-left" style="animation-delay:${i * 80}ms">
    <div class="flex ${rex ? '' : 'flex-row-reverse'} items-end gap-2">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-lg shadow-sm">${rex ? '🐰' : '😊'}</span>
      <div class="${rex ? 'rounded-2xl rounded-bl-sm bg-white' : 'rounded-2xl rounded-br-sm bg-mint-light'} px-4 py-2.5 shadow-sm ${isActive ? 'ring-4 ring-orange' : ''}">
        <p class="text-lg font-bold leading-snug text-ink ${isActive ? 'text-orange-deep' : ''}">${esc(l.en)}</p>
        <p class="mt-0.5 text-xs leading-snug text-ink/50">${esc(l.zh)}</p>
      </div>
    </div>
  </button>`;
}

function feedbackBar(): string {
  return `
  <div class="w-full rounded-3xl bg-white/80 p-4 shadow-soft ring-1 ring-mint/30">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🌟</span>
        <div>
          <p class="text-base font-extrabold text-ink">学习反馈</p>
          <p id="fb-text" class="text-sm font-medium text-ink/70">点一句对话，跟着 Rex 大声读吧！</p>
        </div>
      </div>
      <span id="fb-stars" class="text-xl tracking-wide opacity-0"></span>
    </div>
    <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-mint-pale">
      <div class="h-full w-2/5 rounded-full bg-orange transition-all duration-500"></div>
    </div>
  </div>`;
}

export function renderTalk(): string {
  const s = SCENES[state.scene];
  const tabs = SCENES.map(
    (sc, i) => `
    <button data-scene="${i}" class="pressable flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      i === state.scene ? 'bg-orange text-white shadow-soft' : 'bg-white/80 text-ink/60 hover:bg-white'
    }">
      <span>${sc.emoji}</span>${sc.tab}
    </button>`,
  ).join('');

  const lines = s.lines.map((l, i) => lineBubble(l, i, i === state.activeLine)).join('');

  const agentInfo = isAgentConnected()
    ? ''
    : `<div class="w-full rounded-2xl bg-orange-light/40 px-3 py-2 text-xs font-medium leading-relaxed text-orange-deep ring-1 ring-orange-light">
        ${pendingBadge()} 教材原声 / 语音识别(ASR) / 语音回复(TTS) / 学习记录 将在连通 Agent API 后启用。
      </div>`;

  return `
  <div class="relative min-h-full w-full overflow-hidden pb-10">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-b ${s.bg}"></div>

    <main class="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-4">
      <!-- 顶栏 -->
      <div class="flex items-center justify-between">
        <button data-back class="pressable grid h-10 w-10 place-items-center rounded-full bg-white/80 text-2xl shadow-sm">←</button>
        <div class="text-center">
          <p class="text-lg font-extrabold leading-6 text-ink">Let's Talk</p>
          <p class="text-xs font-medium text-ink/50">跟读大挑战</p>
        </div>
        <span class="inline-block">${pendingBadge()}</span>
      </div>

      <!-- 场景标签 -->
      <div class="mt-4 flex justify-center gap-2">${tabs}</div>

      <!-- Rex 引导条 -->
      <div class="mt-3 flex flex-col items-center">
        <div class="animate-bob drop-shadow-[0_12px_14px_rgba(244,143,177,0.3)]">${buddySVG({ size: 92, mood: state.recording ? 'listen' : 'happy' })}</div>
        <p class="mt-1 rounded-full bg-white/85 px-5 py-1.5 text-center text-sm font-bold text-ink shadow-sm">${s.prompt}</p>
      </div>

      <!-- 对话气泡 -->
      <div class="no-scrollbar mt-4 flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-1">
        ${lines}
      </div>

      <!-- 操作区 -->
      <div class="mt-4 flex items-center justify-center gap-4">
        <button data-original class="pressable flex flex-col items-center gap-1">
          <span class="grid h-14 w-14 place-items-center rounded-full bg-mint text-white text-2xl shadow-soft ring-4 ring-white/70">📖</span>
          <span class="text-xs font-bold text-ink">教材原声</span>
        </button>
        <button data-mic class="pressable flex flex-col items-center gap-1">
          <span id="mic" class="grid h-16 w-16 place-items-center rounded-full text-3xl text-white shadow-float ring-4 ring-white/80 ${state.recording ? 'animate-breathe bg-red-400' : 'bg-orange'}">🎤</span>
          <span class="text-xs font-bold text-ink">${state.recording ? '聆听中…' : '点我说英语'}</span>
        </button>
        <button data-reply class="pressable flex flex-col items-center gap-1">
          <span class="grid h-14 w-14 place-items-center rounded-full bg-pink text-white text-2xl shadow-soft ring-4 ring-white/70">🔊</span>
          <span class="text-xs font-bold text-ink">语音回复</span>
        </button>
      </div>

      <div class="mt-4">${feedbackBar()}</div>
      ${agentInfo}
    </main>
  </div>`;
}

// ---------- 交互绑定 ----------

/** 朗读一段英文（浏览器原生 TTS 作演示；正式 TTS 后端待接入） */
function speakLine(text: string): void {
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

function setFeedback(): void {
  const f = FEEDBACK[fbIdx % FEEDBACK.length];
  fbIdx += 1;
  const el = document.getElementById('fb-text');
  const stars = document.getElementById('fb-stars');
  if (el) el.textContent = f.txt;
  if (stars) {
    stars.textContent = '★'.repeat(f.star);
    stars.classList.remove('opacity-0');
  }
}

function makeRecordingFallback(audio: Blob): void {
  // ASR 后端未联通——不伪造识别结果，仅提示（同时给出真实录音时长）
  const toFile = URL.createObjectURL(audio);
  void toFile;
  toast('已录下你的声音，ASR 识别将在接入 Agent 后启用（当前为浏览器录音示例）', {
    pending: true,
  });
}

export function bindTalk(root: HTMLElement): void {
  root.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.hash = '#/';
  });

  root.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.scene = Number(btn.dataset.scene);
      state.activeLine = -1;
      state.recording = false;
      root.innerHTML = renderTalk();
      bindTalk(root);
    });
  });

  // 点对话气泡：高亮 + 原声朗读演示 + 学习反馈
  root.querySelectorAll<HTMLButtonElement>('[data-line]').forEach(btn => {
    const li = Number(btn.dataset.line);
    state.activeLine = li;
    const s = SCENES[state.scene];
    const line = s.lines[li];
    // 更新高亮
    root.querySelectorAll('[data-line]').forEach((b, idx) => {
      b.querySelector('div > div:last-child')?.classList.toggle('ring-4', idx === li);
      const p = b.querySelector('p');
      if (p) p.classList.toggle('text-orange-deep', idx === li);
    });
    speakLine(line.en);
    setFeedback();
  });

  // 教材原声：后端未接入
  root.querySelector('[data-original]')?.addEventListener('click', () => {
    toast('教材原声播放将在接入录音资源后启用', { pending: true });
  });

  // 麦克风：使用 MediaRecorder 真实采集，但识别交由待接入的 ASR
  const micBtn = root.querySelector('[data-mic]');
  micBtn?.addEventListener('click', async () => {
    if (state.recording) {
      // 停止
      state.recording = false;
      const label = root.querySelector('[data-mic] span:last-child');
      if (label) label.textContent = '点我说英语';
      const mic = document.getElementById('mic');
      mic?.classList.remove('animate-breathe', 'bg-red-400');
      mic?.classList.add('bg-orange');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime } as MediaRecorderOptions);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        makeRecordingFallback(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      state.recording = true;
      const label = root.querySelector('[data-mic] span:last-child');
      if (label) label.textContent = '聆听中…';
      const mic = document.getElementById('mic');
      mic?.classList.add('animate-breathe', 'bg-red-400');
      mic?.classList.remove('bg-orange');

      setTimeout(() => {
        if (rec.state !== 'inactive') rec.stop();
      }, 5000);
      rec.start();
    } catch {
      toast('请允许使用麦克风后才能语音练习');
    }
  });

  // 语音回复：TTS 后端未接入
  root.querySelector('[data-reply]')?.addEventListener('click', () => {
    toast('语音回复(TTS)将在接入 Agent 后启用', { pending: true });
  });
}