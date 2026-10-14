import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { LLMClient, S3Storage } from 'coze-coding-dev-sdk';
import type { Request } from 'express';
import { runTutorTurn, startScene } from '../server/tutor/workflow';
import { recordSubmission, type SubmitInput } from '../server/tutor/records';

const req = { headers: {} } as Request;

test('model failure preserves correction and scripted advancement', async t => {
  t.mock.method(LLMClient.prototype, 'invoke', async () => { throw new Error('offline'); });
  startScene('test-correction', 'pet');
  const wrong = await runTutorTurn(req, { uid: 'test-correction', scene: 'pet', text: 'I has a dog', history: [] });
  assert.equal(wrong.verdict, 'incorrect');
  assert.equal(wrong.action, 'retry_hint');
  assert.equal(wrong.replySource, 'script');
  assert.match(wrong.reply, /Try again/);
  const retry = await runTutorTurn(req, { uid: 'test-correction', scene: 'pet', text: 'I has a dog', history: [] });
  assert.equal(retry.action, 'retry_model');
  assert.match(retry.reply, /Listen:/);
  const next = await runTutorTurn(req, { uid: 'test-correction', scene: 'pet', text: 'Yes, I do.', history: [] });
  assert.equal(next.action, 'advance');
  assert.match(next.reply, /Well done!/);
  const other = await runTutorTurn(req, { uid: 'test-other', scene: 'pet', text: 'Yes, I do.', history: [] });
  assert.equal(other.round, 1);
});

test('storage upload failure cannot delete the last durable record', async t => {
  const objects = new Map<string, Buffer>();
  t.mock.method(S3Storage.prototype, 'listFiles', async ({ prefix }: { prefix: string }) => ({ keys: [...objects.keys()].filter(k => k.startsWith(prefix)), isTruncated: false }));
  t.mock.method(S3Storage.prototype, 'readFile', async ({ fileKey }: { fileKey: string }) => objects.get(fileKey)!);
  let fail = false;
  t.mock.method(S3Storage.prototype, 'uploadFile', async ({ fileName, fileContent }: { fileName: string; fileContent: Buffer }) => {
    if (fail) throw new Error('upload failed');
    const key = fileName.replace('.json', '_abcdef01.json');
    objects.set(key, fileContent);
    return key;
  });
  t.mock.method(S3Storage.prototype, 'deleteFile', async ({ fileKey }: { fileKey: string }) => objects.delete(fileKey));
  const input: SubmitInput = { uid: 'ab-123456789012345678901234', qid: 'U3-001', session: 'session-one', page: 29, type: 'word', answer: 'cat', isRetry: false, errorType: 'word', vocabOk: false, formOk: false, asrSkipped: false, isCorrect: false };
  await recordSubmission(input);
  const previous = [...objects.values()][0];
  fail = true;
  await assert.rejects(recordSubmission({ ...input, answer: 'dog', isCorrect: true }), /upload failed/);
  assert.equal(objects.size, 1);
  assert.equal([...objects.values()][0], previous);
});

test('production API: isolated identity, original audio, JSON errors and WAV size', async () => {
  const env = { ...process.env, NODE_ENV: 'production', PORT: '5157', AB_SESSION_SECRET: 'automated-test-only' };
  for (const key of Object.keys(env)) if (key.startsWith('COZE_')) delete env[key as keyof typeof env];
  const child = spawn(process.execPath, ['dist-server/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${log}`)), 10000);
    child.stdout.on('data', data => { log += String(data); if (log.includes('Server running')) { clearTimeout(timer); resolve(); } });
    child.stderr.on('data', data => { log += String(data); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${log}`)); });
  });
  const base = 'http://127.0.0.1:5157';
  try {
    await ready;
    const a = await fetch(`${base}/api/session`);
    const cookie = a.headers.get('set-cookie')!.split(';')[0];
    const uidA = (await a.json()).uid;
    const b = await fetch(`${base}/api/session`);
    assert.notEqual(uidA, (await b.json()).uid);
    const spoof = await fetch(`${base}/api/session?uid=another-student`, { headers: { cookie } });
    assert.equal((await spoof.json()).uid, uidA);
    const audio = await fetch(`${base}/api/audio/U03_03`, { headers: { cookie } });
    assert.equal((await audio.json()).url, '/api/audio/U03_03/file');
    const mp3 = await fetch(`${base}/api/audio/U03_03/file`, { headers: { cookie, range: 'bytes=0-100' } });
    assert.equal(mp3.status, 206);
    assert.equal((await mp3.arrayBuffer()).byteLength, 101);
    const missing = await fetch(`${base}/api/no-such-route`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'api_not_found');
    const invalid = await fetch(`${base}/api/asr`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
    assert.match(invalid.headers.get('content-type')!, /application\/json/);
    const wav = await fetch(`${base}/api/asr`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ base64Data: 'A'.repeat(300000) }) });
    assert.equal(wav.status, 502); // missing cloud credentials, not the old 100KB limit
    const huge = await fetch(`${base}/api/asr`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ base64Data: 'A'.repeat(9 * 1024 * 1024) }) });
    assert.equal(huge.status, 413);
    assert.match((await huge.json()).error, /30/);
    const health = await fetch(`${base}/api/health`);
    const status = await health.json();
    assert.equal(status.cloudConfigured, false);
    assert.equal(status.checked, false);
    const denied = await fetch(`${base}/api/session`, { headers: { origin: 'https://other.example', cookie } });
    assert.equal(denied.status, 403);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
});
