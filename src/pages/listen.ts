import { ASSETS } from '../assets';
import { toast } from '../components/ui';
import { topBar, sideMenu, bindShell, type SideItem } from '../components/shell';

type SectionKey = 'partA' | 'partB' | 'letters' | 'circle';

interface Section {
  key: SectionKey;
  emoji: string;
  title: string;
  sub: string;
  page: string;
  hint: string;
  words: string[];
}

const SECTIONS: Section[] = [
  { key: 'partA', emoji: '🐶', title: 'Part A', sub: '宠物词汇', page: 'P29　Part A　Let’s learn', hint: '仔细听，试着拼一拼单词哦！', words: ['dog', 'cat', 'pet', 'rabbit', 'panda'] },
  { key: 'partB', emoji: '🐘', title: 'Part B', sub: '动物词汇', page: 'P33　Part B　Let’s learn', hint: '动物园里有好多动物，认真听！', words: ['tiger', 'lion', 'elephant', 'giraffe', 'monkey'] },
  { key: 'letters', emoji: '🔤', title: 'Letters', sub: '字母与拼读', page: 'P35　Letters and sounds', hint: '跟着字母，读一读，拼一拼！', words: ['Aa', 'Bb', 'Cc', 'Dd', 'Ee'] },
  { key: 'circle', emoji: '🎧', title: 'Listen and circle', sub: '听力练习', page: 'P36　Listen and circle', hint: '听一听，把听到的单词圈出来吧！', words: ['cat', 'dog', 'bird', 'duck', 'bear'] },
];

const state: { section: SectionKey; index: number; answered: boolean } = {
  section: 'partA',
  index: 0,
  answered: false,
};

function speakWord(word: string): void {
  if (!('speechSynthesis' in window)) {
    toast('当前浏览器不支持语音朗读');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.75;
    u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    toast('语音播放暂不可用');
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
  const s = SECTIONS.find(x => x.key === state.section) ?? SECTIONS[0];
  const total = s.words.length;
  const current = s.words[state.index];
  const progressPct = ((state.index) / total) * 100;

  const side: SideItem[] = SECTIONS.map(x => ({
    key: x.key,
    emoji: x.emoji,
    title: x.title,
    sub: x.sub,
  }));

  return `
  <div class="min-h-screen bg-cream">
    ${topBar({ emoji: '🦻', emojiBg: 'bg-pink-light', title: "Let's Listen", subtitle: '听力与听写' })}

    <main class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
      <div class="lg:w-64 lg:shrink-0">${sideMenu(side, s.key)}</div>

      <section class="flex-1 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-black/5 sm:p-7">
        <div class="flex items-center justify-between">
          <p class="text-lg font-bold text-ink/55">${s.page}</p>
          <p class="text-2xl font-extrabold text-ink">${state.index + 1} / ${total}</p>
        </div>
        <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-mint-pale">
          <div class="h-full rounded-full bg-grass transition-all duration-500" style="width:${progressPct}%"></div>
        </div>

        <!-- 播放条 -->
        <div class="mt-6 flex flex-wrap items-center gap-4 rounded-3xl bg-mint-pale/60 p-4">
          <button data-play class="pressable grid h-16 w-16 place-items-center rounded-full bg-grass text-3xl text-white shadow-float">▶</button>
          <span class="flex h-10 flex-1 items-center gap-1 overflow-hidden">${eqWave()}</span>
          <span class="text-lg font-bold text-ink/50">0:00 / 0:03</span>
          <button data-replay-word class="pressable flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-lg font-extrabold text-ink shadow-sm">
            <span>🔄</span> 再听一次
          </button>
        </div>

        <!-- 听写输入 -->
        <p class="mt-7 flex items-center gap-2 text-xl font-extrabold text-ink">
          <span>✏️</span> 听到的单词是：
        </p>
        <input id="listen-input" type="text" autocomplete="off" placeholder="请输入你听到的英文单词…"
          class="mt-3 w-full rounded-2xl border-2 border-mint-soft bg-cream/60 px-5 py-4 text-xl font-bold text-ink outline-none transition-colors focus:border-grass" />

        <button id="submit-answer" class="pressable mt-5 w-full rounded-2xl bg-grass py-4 text-2xl font-extrabold text-white shadow-float">提交答案</button>

        <div id="answer-result" class="mt-3"></div>

        <div class="mt-6 flex items-end justify-between gap-4">
          <div class="flex items-center gap-3 rounded-2xl bg-cream-deep/70 px-4 py-3">
            <span class="text-3xl">💡</span>
            <div>
              <p class="text-lg font-extrabold text-orange-deep">小提示</p>
              <p class="text-base font-medium text-ink/65">${s.hint}</p>
            </div>
          </div>
          <img src="${ASSETS.panda}" alt="戴耳机的熊猫伙伴" class="hidden h-32 w-32 rounded-3xl object-cover ring-2 ring-white shadow-sm sm:block" width="128" height="128" loading="lazy" />
        </div>
      </section>
    </main>
  </div>`;
}

function check(root: HTMLElement): void {
  if (state.answered) {
    // 已提交：进入下一题
    const s = SECTIONS.find(x => x.key === state.section) ?? SECTIONS[0];
    state.index = (state.index + 1) % s.words.length;
    state.answered = false;
    root.innerHTML = renderListen();
    bindListen(root);
    return;
  }

  const input = document.getElementById('listen-input') as HTMLInputElement | null;
  const result = document.getElementById('answer-result');
  const s = SECTIONS.find(x => x.key === state.section) ?? SECTIONS[0];
  const answer = s.words[state.index];
  const value = (input?.value ?? '').trim().toLowerCase();

  if (!value) {
    toast('先写下你听到的单词，再提交哦');
    return;
  }

  const correct = value === answer.toLowerCase();
  state.answered = true;
  if (result) {
    result.innerHTML = correct
      ? `<div class="animate-pop-in flex items-center gap-3 rounded-2xl bg-grass-pale px-4 py-3 ring-2 ring-grass-soft">
          <span class="text-2xl">🎉</span>
          <span class="text-lg font-extrabold text-grass-deep">答对啦！答案就是 <b>${answer}</b>，太棒了！</span>
        </div>`
      : `<div class="animate-pop-in flex items-center gap-3 rounded-2xl bg-orange-light/40 px-4 py-3 ring-2 ring-orange-light">
          <span class="text-2xl">💪</span>
          <span class="text-lg font-extrabold text-orange-deep">再听一次试试～正确答案是 <b>${answer}</b></span>
        </div>`;
  }
  const btn = document.getElementById('submit-answer');
  if (btn) btn.textContent = state.index + 1 === (SECTIONS.find(x => x.key === state.section)?.words.length ?? 1) ? '再来一轮' : '下一题';
  if (correct) speakWord(answer);
}

export function bindListen(root: HTMLElement): void {
  bindShell(root);

  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.section = btn.dataset.side as SectionKey;
      state.index = 0;
      state.answered = false;
      root.innerHTML = renderListen();
      bindListen(root);
    });
  });

  const playCurrent = (): void => {
    const s = SECTIONS.find(x => x.key === state.section) ?? SECTIONS[0];
    // 浏览器 TTS 朗读示例；正式教材音频待接入
    speakWord(s.words[state.index]);
    toast('当前为浏览器示例朗读，教材原声音频待接入', { pending: true });
  };

  root.querySelector('[data-play]')?.addEventListener('click', playCurrent);
  root.querySelector('[data-replay-word]')?.addEventListener('click', playCurrent);
  root.querySelector('#submit-answer')?.addEventListener('click', () => check(root));
  document.getElementById('listen-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') check(root);
  });
}