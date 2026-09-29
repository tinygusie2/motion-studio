// The web demo source against a real Chrome (an installed one, or the headless Chrome HyperFrames keeps). Skipped without.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, launchBrowser } from '../src/cdp.mjs';
import { WebDemo, deviceFor, encodeFrames } from '../src/demo-web.mjs';
import { analyzeGestures } from '../src/gestures.mjs';
import { defaultDatasets } from '../src/demo.mjs';
import { layouts } from '../src/template.mjs';

const exe = findChrome();
const hasFfmpeg = !spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status;
const skip = exe && hasFfmpeg ? false : 'needs Chrome (or Edge) and ffmpeg';

const PAGE = readFileSync(new URL('./fixtures/demo-app.html', import.meta.url), 'utf8');

const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
after(() => { browser?.close(); server.close(); });
const run = (cmd, args) => new Promise((ok, fail) => { const p = spawn(cmd, args, { windowsHide: true }); let out = ''; p.stderr.on('data', d => (out += d)); p.on('close', c => (c ? fail(new Error(out)) : ok())); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('devices have the shape of the layout screens they stand in for', () => {
  for (const layout of Object.keys(layouts)) {
    const d = deviceFor(layout), [sw, sh] = layouts[layout].screen;
    assert.ok(Math.abs(d.css[0] / d.css[1] - sw / sh) < 0.01, `${layout}: ${d.css} vs ${sw}×${sh}`);
  }
  assert.equal(deviceFor('phone', 'high').dsf, 3);
});

test('a phone page: taps click, swipes scroll, filling works, and the recording becomes an mp4 with its gestures', { skip }, async () => {
  browser = await launchBrowser({ exe });
  let frames = 0;
  const demo = await WebDemo.open(browser, { url, layout: 'phone', dataset: defaultDatasets('nl')[0] }, { onFrame: () => frames++ });
  await sleep(600);
  assert.ok(frames > 0, 'frames arrive');
  assert.equal(await demo.evaluate('innerWidth + "x" + innerHeight + "@" + devicePixelRatio'), '390x844@2');
  assert.match(await demo.evaluate('navigator.userAgent'), /Android.*Mobile/);

  await demo.startRecording();
  // A tap on the button.
  await demo.input({ type: 'down', x: 60, y: 50 }); await sleep(80); await demo.input({ type: 'up', x: 60, y: 50 });
  await sleep(300);
  assert.equal(await demo.title(), 'clicked 1', 'the tap became a click');
  // A swipe up on the list.
  const before = await demo.evaluate('document.getElementById("list").scrollTop');
  await demo.input({ type: 'down', x: 200, y: 650 });
  for (let i = 1; i <= 8; i++) { await sleep(20); await demo.input({ type: 'move', x: 200, y: 650 - i * 40 }); }
  await demo.input({ type: 'up', x: 200, y: 330 });
  await sleep(500);
  assert.ok((await demo.evaluate('document.getElementById("list").scrollTop')) > before + 100, 'the swipe scrolled the list');
  // Fill every empty field with the demo persona.
  const done = await demo.fill(defaultDatasets('nl')[0], 'all');
  assert.deepEqual(done.map(d => d.kind), ['email', 'firstName', 'password']);
  assert.equal(await demo.evaluate('[e.value, f.value, p.value.length].join("|")'), 'jan@voorbeeld.nl|Jan|15', 'also right after a swipe, which leaves the page scrolling');
  await sleep(300);

  const rec = await demo.stopRecording();
  const gestures = analyzeGestures(rec.events, deviceFor('phone').css);
  assert.deepEqual(gestures.filter(g => g.kind !== 'type').map(g => g.kind).slice(0, 2), ['tap', 'swipe']);
  assert.equal(gestures.filter(g => g.kind === 'tap').length, 4, 'the button and the three fields');
  assert.ok(gestures.some(g => g.kind === 'type' && g.text.includes('jan@voorbeeld.nl')), 'typing is in the log');
  assert.ok(rec.frames.length >= 5);
  const out = join(tmpdir(), `ms-demo-test-${Date.now()}.mp4`);
  const dur = await encodeFrames(rec, out, run);
  assert.ok(dur > 3 && dur < 20, `duration ${dur}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout;
  assert.match(probe, /780,1688,30\/1/, 'the frames are the device size × pixel density');
  assert.ok(Math.abs(+probe.trim().split('\n').pop() - dur) < 0.2, 'the video is as long as the recording');
  assert.ok(statSync(out).size > 5000);
  demo.discard(rec);
  await demo.close();
});

test('a browser-layout page uses the mouse: hover, click, wheel scroll and the keyboard', { skip }, async () => {
  browser ??= await launchBrowser({ exe });
  const demo = await WebDemo.open(browser, { url, layout: 'browser' });
  await sleep(400);
  assert.equal(await demo.evaluate('innerWidth + "x" + innerHeight'), '1280x814');
  await demo.input({ type: 'down', x: 60, y: 50 }); await demo.input({ type: 'up', x: 60, y: 50 });
  await sleep(200);
  assert.equal(await demo.title(), 'clicked 1');
  await demo.input({ type: 'wheel', x: 300, y: 500, dx: 0, dy: 200 });
  await sleep(400);
  assert.ok((await demo.evaluate('document.getElementById("list").scrollTop')) > 0, 'the wheel scrolled');
  await demo.input({ type: 'down', x: 100, y: 150 }); await demo.input({ type: 'up', x: 100, y: 150 });
  await demo.input({ type: 'key', key: 'h' }); await demo.input({ type: 'key', key: 'i' });
  assert.equal(await demo.evaluate('document.getElementById("e").value'), 'hi');
  await assert.rejects(demo.fill(defaultDatasets('en')[0], 'focused').then(async () => { await demo.evaluate('document.activeElement.blur()'); return demo.fill(defaultDatasets('en')[0], 'focused'); }), /Klik eerst op een invulveld/);
  await demo.close();
});
