import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { bindListen, cleanupListen } from '../src/pages/listen';
import { bindTalk, cleanupTalk } from '../src/pages/talk';
import { leavePage } from '../src/pages/lifecycle';
import { escapeHtml, playAudio, stopAudio } from '../src/components/ui';

function stubGlobal(t: TestContext, key: string, value: unknown): void {
  const old = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else Reflect.deleteProperty(globalThis, key); });
}

class ElementStub {
  id = ''; className = ''; textContent = ''; value = ''; disabled = false;
  dataset: Record<string, string> = {};
  writes = 0;
  callbacks = new Map<string, () => void>();
  elements = new Map<string, ElementStub>();
  markup = '';
  get innerHTML(): string { return this.markup; }
  set innerHTML(value: string) { this.markup = value; this.writes++; }
  addEventListener(event: string, callback: () => void): void { this.callbacks.set(event, callback); }
  querySelector(selector: string): ElementStub {
    let result = this.elements.get(selector);
    if (!result) { result = new ElementStub(); this.elements.set(selector, result); }
    return result;
  }
  querySelectorAll(): ElementStub[] { return []; }
  appendChild(): void {}
  replaceChildren(): void {}
  remove(): void {}
  focus(): void {}
}
const documentStub = {
  body: new ElementStub(),
  getElementById: () => null,
  createElement: () => new ElementStub(),
};
const session = new Map<string, string>();
const sessionStub = { getItem: (key: string) => session.get(key) || null, setItem: (key: string, value: string) => { session.set(key, value); }, removeItem: (key: string) => session.delete(key) };
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve)); };

test('failed listening pool loads once; explicit retry is required', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input) === '/api/session') return Response.json({ uid: 'test' });
    count++;
    return Response.json({ error: 'unavailable' }, { status: 503 });
  });
  stubGlobal(t, 'document', documentStub);
  stubGlobal(t, 'sessionStorage', sessionStub);
  let count = 0;
  const root = new ElementStub();
  bindListen(root as unknown as HTMLElement);
  await flush();
  assert.equal(count, 1);
  assert.match(root.innerHTML, /unavailable/);
  await flush();
  assert.equal(count, 1);
  root.querySelector('[data-reload]').callbacks.get('click')!();
  await flush();
  assert.equal(count, 2);
  cleanupListen();
});

test('late scene initialization cannot repaint a page after navigation', async t => {
  stubGlobal(t, 'document', documentStub);
  let finish: (value: Response) => void = () => undefined;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input) === '/api/health') return Response.json({ cloudConfigured: false });
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const root = new ElementStub();
  bindTalk(root as unknown as HTMLElement);
  await flush();
  leavePage();
  cleanupTalk();
  const before = root.writes;
  finish(Response.json({ opening: 'old reply', openingZh: '', page: 28 }));
  await flush();
  assert.equal(root.writes, before);
});

test('text is escaped and autoplay rejection offers an explicit play action', async t => {
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  let paused = 0;
  class AudioStub {
    onerror: (() => void) | null = null;
    async play(): Promise<void> { throw new DOMException('autoplay blocked', 'NotAllowedError'); }
    pause(): void { paused++; }
    removeAttribute(): void {}
    load(): void {}
  }
  const buttons: ElementStub[] = [];
  stubGlobal(t, 'Audio', AudioStub);
  stubGlobal(t, 'document', { ...documentStub, body: { appendChild: (element: ElementStub) => { buttons.push(element); } } });
  assert.equal(await playAudio('/sample.mp3'), false);
  assert.ok(buttons.some(button => button.id === 'audio-retry'));
  stopAudio();
  assert.equal(paused, 1);
});
