// The demo recorder through the server's HTTP API, against a real Chrome. Skipped without Chrome and ffmpeg.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep the real ~/.motion-studio out of it.
const home = mkdtempSync(join(tmpdir(), 'ms-demo-home-'));
process.env.MS_REAL_USERPROFILE = process.env.USERPROFILE; // Chrome does not start on Windows with a moved profile folder
process.env.HOME = process.env.USERPROFILE = home;
const { startServer } = await import('../src/server.mjs');
const { createWorkspace } = await import('../src/workspace.mjs');
const { findChrome } = await import('../src/cdp.mjs');

const skip = findChrome() && !spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status ? false : 'needs Chrome (or Edge) and ffmpeg';
const PAGE = readFileSync(new URL('./fixtures/demo-app.html', import.meta.url), 'utf8');
const app = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const appUrl = `http://127.0.0.1:${app.address().port}/`;

const ws = join(home, 'project');
createWorkspace(ws, 'Demo test');
const { server, url } = await startServer({ port: 0, workspace: ws });
after(() => { server.close(); app.close(); });

const post = (path, body) => fetch(`${url}/api/demo/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const json = async r => r.json();
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('demo data: sample persona first, saved changes come back, apps are remembered', async () => {
  const first = await json(await fetch(`${url}/api/demo/data`));
  assert.equal(first.datasets.length, 1);
  assert.ok(first.datasets[0].fields.email);
  const saved = await json(await fetch(`${url}/api/demo/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasets: [...first.datasets, { id: 'klant', name: 'Klant', fields: { email: 'k@x.nl' }, storage: { local: { token: 't' } } }], apps: [{ id: 'a', name: 'App', url: 'http://localhost:3000', layout: 'phone' }] }) }));
  assert.equal(saved.datasets.length, 2);
  assert.ok(existsSync(join(ws, 'demo.json')));
  const again = await json(await fetch(`${url}/api/demo/data`));
  assert.deepEqual(again.datasets.map(d => d.id), [first.datasets[0].id, 'klant']);
  assert.equal(again.apps[0].url, 'http://localhost:3000');
});

test('opening needs an http address, and nothing is open at first', async () => {
  assert.equal((await json(await fetch(`${url}/api/demo/status`))).open, false);
  const r = await post('open', { source: 'web', url: 'javascript:alert(1)' });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /http:\/\//);
  assert.equal((await post('input', { events: [] })).status, 500, 'no session, no input');
});

test('a full take: open, watch the live picture, tap, fill, record, and get a clip with its gestures', { skip }, async () => {
  const opened = await json(await post('open', { source: 'web', url: appUrl, layout: 'phone', dataset: 'klant' }));
  assert.deepEqual([opened.open, opened.source, opened.css, opened.dsf], [true, 'web', [390, 844], 2]);

  // The live picture is a stream of server-sent events: a meta line and pictures (JPEG, base64).
  const ctl = new AbortController();
  const res = await fetch(`${url}/api/demo/frames`, { signal: ctl.signal });
  assert.match(res.headers.get('content-type'), /event-stream/);
  const seen = { meta: 0, frames: 0 };
  const reader = res.body.getReader(), dec = new TextDecoder();
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) return; const text = dec.decode(value); seen.meta += (text.match(/event: meta/g) || []).length; seen.frames += (text.match(/data: \/9j\//g) || []).length; } } catch {} })();
  await sleep(700);
  assert.ok(seen.meta >= 1, 'a meta event');
  assert.ok(seen.frames >= 1, 'a picture');

  assert.ok((await json(await post('record', { action: 'start' }))).t0 > 0);
  // Like the editor, every event carries when it happened: a busy PC may deliver the up long after the down.
  const tap = async (x, y) => { const at = Date.now(); await post('input', { events: [{ type: 'down', x, y, at }] }); await sleep(70); await post('input', { events: [{ type: 'up', x, y, at: at + 70 }] }); await sleep(250); };
  await tap(60, 50); // the button
  const filled = await json(await post('fill', { dataset: 'klant', mode: 'all' }));
  assert.deepEqual(filled.filled.map(f => f.kind), ['email'], 'only the fields the dataset has something for');
  assert.equal((await json(await fetch(`${url}/api/demo/status`))).recording, true);
  await sleep(300);

  const done = await json(await post('record', { action: 'stop' }));
  assert.match(done.clip, /^demo-\d{8}-\d{6}\.mp4$/);
  assert.ok(existsSync(join(ws, 'assets', 'clips', done.clip)));
  assert.ok(statSync(join(ws, 'assets', 'clips', done.clip)).size > 3000);
  assert.deepEqual(done.css, [390, 844]);
  assert.equal(done.layout, 'phone');
  assert.ok(done.dur > 2, `dur ${done.dur}`);
  assert.deepEqual(done.gestures.filter(g => g.kind !== 'type').map(g => g.kind), ['tap', 'tap']);
  assert.ok(done.gestures.some(g => g.kind === 'type' && g.text === 'k@x.nl'));
  // The button changes the picture, so the recording can be measured: how long until the screen reacted to the tap.
  assert.ok(done.syncMeasured >= 1, `measured from ${done.syncMeasured} taps`);
  assert.ok(done.sync >= 0.02 && done.sync < 0.8, `delay ${done.sync}`);

  ctl.abort();
  const closed = await json(await fetch(`${url}/api/demo/session`, { method: 'DELETE' }));
  assert.equal(closed.open, false);
  // The clip is an ordinary project clip now: the media pool lists it.
  const state = await json(await fetch(`${url}/api/state`));
  assert.ok(state.clips.includes(done.clip));
  assert.equal(state.clipAudio[done.clip], false, 'a screen recording has no sound');
  assert.deepEqual(state.insets.phone, [12, 12, 1]);
});

test('a demo does not outlive its project', { skip }, async () => {
  await json(await post('open', { source: 'web', url: appUrl, layout: 'browser' }));
  assert.equal((await json(await fetch(`${url}/api/demo/status`))).open, true);
  const other = join(home, 'project-2');
  createWorkspace(other, 'Other');
  await fetch(`${url}/api/workspace/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: other }) });
  assert.equal((await json(await fetch(`${url}/api/demo/status`))).open, false);
});
