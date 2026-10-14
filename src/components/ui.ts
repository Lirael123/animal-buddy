/** 「待接入」标签徽章，用于清晰标注未联通的后端能力 */
export function pendingBadge(label = '待接入'): string {
  return `<span class="inline-flex items-center gap-1 rounded-full bg-orange-light/70 px-2.5 py-0.5 text-xs font-bold leading-6 text-orange-deep">
    <span class="inline-block h-2 w-2 rounded-full bg-orange"></span>${label}
  </span>`;
}

/**
 * 轻量 Toast：给用户即时、友好的操作反馈。
 * 若说明功能属「待接入」，toast 会带上橙色提醒。
 */
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
export function toast(message: string, opts: { pending?: boolean } = {}): void {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className =
      'fixed left-1/2 top-6 z-[999] flex w-[88%] max-w-md -translate-x-1/2 flex-col items-center gap-2';
    document.body.appendChild(host);
  }

  const pending = opts.pending ?? false;
  const el = document.createElement('div');
  el.className =
    'animate-pop-in flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 shadow-float ring-2 ' +
    (pending ? 'ring-orange-light' : 'ring-mint-soft');
  el.innerHTML = pending ? pendingBadge() : '';
  const text = document.createElement('span');
  text.className = 'text-sm font-semibold text-ink';
  text.textContent = message;
  el.appendChild(text);
  host.replaceChildren(el);

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    host?.querySelectorAll('div')?.forEach(n => n.remove());
  }, 2600);
}

/** 真实播放一段音频（仅当 url 存在可用时） */
let activeAudio: HTMLAudioElement | null = null;
let audioVersion = 0;
export function stopAudio(): void {
  audioVersion++;
  activeAudio?.pause();
  if (activeAudio) {
    activeAudio.removeAttribute('src');
    activeAudio.load();
  }
  activeAudio = null;
  document.getElementById('audio-retry')?.remove();
}

/** Handle autoplay rejection explicitly and provide a fresh user gesture. */
export async function playAudio(url: string): Promise<boolean> {
  stopAudio();
  const version = audioVersion;
  const audio = new Audio(url);
  activeAudio = audio;
  audio.onerror = () => {
    if (version === audioVersion) toast('音频加载失败，请检查网络后重试');
  };
  try {
    await audio.play();
    return true;
  } catch (error) {
    if (version !== audioVersion) return false;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      const button = document.createElement('button');
      button.id = 'audio-retry';
      button.className = 'fixed bottom-4 right-4 z-[999] rounded-2xl bg-grass px-5 py-3 font-bold text-white shadow-float';
      button.textContent = '🔊 点击播放语音';
      button.onclick = () => { void playAudio(url); };
      document.body.appendChild(button);
      toast('语音已准备好，请点击播放');
    } else {
      toast('音频播放失败，请检查网络后重试');
    }
    return false;
  }
}
