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
  host.appendChild(el);

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    host?.querySelectorAll('div')?.forEach(n => n.remove());
  }, 2600);
}

/** 真实播放一段音频（仅当 url 存在可用时） */
export function playAudio(url: string): void {
  try {
    const audio = new Audio(url);
    void audio.play();
  } catch {
    toast('音频播放失败，请重试');
  }
}