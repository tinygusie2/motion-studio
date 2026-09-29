// Editor UI tests: the real editor in a real browser against `startServer`, on a throwaway project.
// Run with `npm run test:ui`. Uses an installed Chrome or Edge through playwright-core (no browser download);
// without one the tests are skipped.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// Keep the real ~/.motion-studio out of it: settings go to a throwaway home. The browser keeps the real
// environment (Chrome won't start on Windows with a moved USERPROFILE).
const env = { ...process.env };
process.env.MS_REAL_USERPROFILE = process.env.USERPROFILE; // the demo recorder's Chrome needs the real profile folder
const home = mkdtempSync(join(tmpdir(), 'ms-ui-home-'));
process.env.HOME = process.env.USERPROFILE = home;
const { startServer } = await import('../../src/server.mjs');
const { createWorkspace } = await import('../../src/workspace.mjs');
const pw = await import('playwright-core').catch(() => null);
const chromium = pw?.chromium ?? pw?.default?.chromium;
let browser = null;
for (const channel of ['chrome', 'msedge']) {
  browser = await chromium?.launch({ channel, env }).catch(() => null);
  if (browser) break;
}
// Every test is skipped (not failed) on a machine without a browser to drive.
const uiTest = (name, fn) => test(name, { skip: browser ? false : 'no Chrome or Edge found (or playwright-core missing)' }, fn);

// A solid-color PNG, so the project has clips without needing ffmpeg.
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, k) => [r, g, b][k % 3])]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

const spec = {
  brand: 'brand', layout: 'phone', dur: 10, end: 8,
  heads: [{ t: 0.3, text: 'Eerste *tekst*' }],
  clips: [{ src: 'a.png', start: 0, dur: 3, media: 0 }, { src: 'b.png', start: 3, dur: 3, media: 0 }, { src: 'a.png', start: 6, dur: 2, media: 0 }],
  chips: [], zooms: [], taps: [], subs: [], vo: { lines: [] }
};

const ws = join(home, 'project');
createWorkspace(ws, 'UI test');
mkdirSync(join(ws, 'assets', 'clips'), { recursive: true });
writeFileSync(join(ws, 'assets', 'clips', 'a.png'), png(40, 80, [200, 40, 40]));
writeFileSync(join(ws, 'assets', 'clips', 'b.png'), png(40, 80, [40, 40, 200]));
const { server, url } = await startServer({ port: 0, workspace: ws });
after(async () => { await browser?.close(); server.close(); });

let page;
const W = 1400, PPS = 100;

// A fresh editor on a fresh copy of the video, at a known timeline zoom.
async function open(t, patch = {}) {
  await fetch(`${url}/api/videos/ui-test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...spec, ...patch, id: 'ui-test' }) });
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, locale: 'nl-NL' });
  await ctx.addInitScript(pps => { localStorage.setItem('ms-pps', String(pps)); }, PPS);
  page = await ctx.newPage();
  await page.goto(url);
  await page.locator('.tl-item.k-clips').first().waitFor();
  t.after(() => ctx.close());
}
const clip = k => page.locator('.tl-item.k-clips').nth(k);
const leftOf = async loc => parseFloat(await loc.evaluate(n => n.style.left));
const saved = () => page.waitForFunction(() => document.querySelector('#save-state').className === 'muted');
const onDisk = async () => (await fetch(`${url}/api/videos/ui-test`)).json();
async function drag(loc, dx, { edge, alt } = {}) {
  const box = await (edge ? loc.locator(`.h.${edge}`) : loc).boundingBox();
  const x = edge ? box.x + box.width / 2 : box.x + Math.min(30, box.width / 2), y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  for (let k = 1; k <= 5; k++) await page.mouse.move(x + dx * k / 5, y);
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

uiTest('dragging a clip moves it, undo puts it and the selection back', async t => {
  await open(t);
  await drag(clip(1), 57);
  assert.equal(await leftOf(clip(1)), 357);
  await saved();
  assert.equal((await onDisk()).clips[1].start, 3.57);
  await page.keyboard.press('Escape'); // deselect
  assert.equal(await page.locator('.tl-item.sel').count(), 0);
  await page.keyboard.press('Control+z');
  assert.equal(await leftOf(clip(1)), 300);
  assert.match(await clip(1).getAttribute('class'), /\bsel\b/);
});

uiTest('edges snap to neighbours, Alt places freely', async t => {
  await open(t);
  await drag(clip(0), -4, { edge: 'r' });
  assert.equal((await clip(0).boundingBox()).width, 300, 'snapped back onto the next clip');
  await drag(clip(0), -4, { edge: 'r', alt: true });
  assert.equal((await clip(0).boundingBox()).width, 296);
});

uiTest('dragging moves the existing blocks instead of rebuilding the timeline', async t => {
  await open(t);
  await clip(1).click();
  await page.evaluate(() => { window.__probe = document.querySelectorAll('.tl-item.k-clips')[2]; });
  const box = await clip(1).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 10); await page.mouse.move(box.x + 80, box.y + 10);
  assert.ok(await page.evaluate(() => document.body.contains(window.__probe)), 'same element while dragging');
  await page.mouse.up();
});

uiTest('S splits the clip under the playhead', async t => {
  await open(t);
  const ruler = await page.locator('#tl-ruler').boundingBox();
  await page.mouse.click(ruler.x + 1.5 * PPS, ruler.y + 10);
  await page.keyboard.press('s');
  await saved();
  const { clips } = await onDisk();
  assert.deepEqual(clips.map(c => [c.start, c.dur]), [[0, 1.5], [1.5, 1.5], [3, 3], [6, 2]]);
});

uiTest('. and , nudge the selection by a frame', async t => {
  await open(t);
  await clip(1).click();
  await page.keyboard.press('.'); await page.keyboard.press('.'); await page.keyboard.press('Shift+.');
  await page.keyboard.press(',');
  await saved();
  assert.equal((await onDisk()).clips[1].start, 3.37); // +1 +1 +10 −1 frames at 30 fps
  await page.keyboard.press('Control+z'); // the nudges are one undo step
  await saved();
  assert.equal((await onDisk()).clips[1].start, 3);
});

uiTest('Ctrl+click selects several items; dragging one moves them all', async t => {
  await open(t);
  await clip(0).click();
  await page.locator('.tl-item.k-head').click({ modifiers: ['Control'] });
  await drag(clip(0), 50, { alt: true });
  await saved();
  const v = await onDisk();
  assert.equal(v.clips[0].start, 0.5);
  assert.equal(v.heads[0].t, 0.8);
  assert.equal(v.clips[1].start, 3, 'unselected items stay');
});

uiTest('Shift+Delete removes a clip and closes the gap', async t => {
  await open(t);
  await clip(1).click();
  await page.keyboard.press('Shift+Delete');
  await saved();
  assert.deepEqual((await onDisk()).clips.map(c => [c.src, c.start]), [['a.png', 0], ['a.png', 3]]);
});

uiTest('a change made just before a reload is not lost', async t => {
  await open(t);
  await page.locator('.tl-item.k-head').click();
  await page.locator('#inspector textarea').fill('Nog niet opgeslagen');
  await page.reload(); // well within the 350 ms save delay
  await page.locator('.tl-item.k-head').waitFor();
  assert.equal((await onDisk()).heads[0].text, 'Nog niet opgeslagen');
});

uiTest('a clip dragged from the media pool lands on the timeline where it is dropped', async t => {
  await open(t);
  const track = await page.locator('.tl-row[data-key="clips"] .tl-track').boundingBox();
  await page.locator('.clip-wrap').nth(1).dragTo(page.locator('.tl-row[data-key="clips"] .tl-track'), { targetPosition: { x: 8.5 * PPS, y: track.height / 2 } });
  await saved();
  assert.deepEqual((await onDisk()).clips.map(c => [c.src, c.start]).at(-1), ['b.png', 8.5]);
});

uiTest('scrubbing the playhead does not select text', async t => {
  await open(t);
  const ruler = await page.locator('#tl-ruler').boundingBox();
  await page.mouse.move(ruler.x + 300, ruler.y + 10);
  await page.mouse.down();
  await page.mouse.move(ruler.x - 200, ruler.y - 60, { steps: 8 }); // across the labels and the hint above
  await page.mouse.up();
  assert.equal(await page.evaluate(() => String(getSelection())), '');
});

uiTest('a click on an empty spot of the timeline, Esc or the close button deselects', async t => {
  await open(t);
  const selected = () => page.locator('.tl-item.sel').count();
  await clip(1).click();
  assert.equal(await selected(), 1);
  const track = await page.locator('.tl-row[data-key="tap"] .tl-track').boundingBox();
  await page.mouse.click(track.x + 2 * PPS, track.y + track.height / 2);
  assert.equal(await selected(), 0);
  await clip(1).click();
  await page.keyboard.press('Escape');
  assert.equal(await selected(), 0);
  await clip(1).click();
  await page.locator('.insp-close').click();
  assert.equal(await selected(), 0);
});

uiTest('moving a voice-over line takes its captions (also split ones) along, and nothing else', async t => {
  await open(t);
  const v = await onDisk();
  v.vo = { lines: [{ t: 1, len: 1, text: 'eerste zin' }, { t: 5, len: 1, text: 'tweede zin' }] };
  v.subs = [{ t: 1, out: 1.5, text: 'eerste' }, { t: 1.5, out: 2, text: 'zin' }, { t: 5, out: 6, text: 'tweede zin' }];
  await fetch(`${url}/api/videos/ui-test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
  await page.reload();
  const line = page.locator('.tl-item.k-vo').first();
  await line.waitFor();
  await drag(line, 100, { alt: true });
  await saved();
  const after = await onDisk();
  assert.deepEqual(after.vo.lines.map(l => l.t), [2, 5]);
  assert.deepEqual(after.subs.map(s => [s.t, s.out]), [[2, 2.5], [2.5, 3], [5, 6]]);
  await page.keyboard.press('.'); // nudging moves them together too
  await saved();
  assert.deepEqual((await onDisk()).subs.map(s => s.t), [2.03, 2.53, 5]);
});

uiTest('keyframes: added at the playhead, shown as diamonds, kept on both sides of a split', async t => {
  await open(t);
  const ruler = await page.locator('#tl-ruler').boundingBox();
  await clip(1).click(); // clip 1 runs from 3 s to 6 s
  await page.mouse.click(ruler.x + 4 * PPS, ruler.y + 10);
  await page.getByRole('button', { name: /Keyframe op de playhead|Keyframe at the playhead/ }).click();
  await page.mouse.click(ruler.x + 5 * PPS, ruler.y + 10);
  await page.getByRole('button', { name: /Keyframe op de playhead|Keyframe at the playhead/ }).click();
  assert.equal(await clip(1).locator('.kf-dia').count(), 2);
  // Change the second keyframe's scale in the inspector.
  await page.locator('.kf-row').nth(1).locator('label.field', { hasText: /Schaal|Scale/ }).locator('input').fill('1.5');
  await saved();
  const kf = (await onDisk()).clips[1].kf;
  assert.deepEqual(kf.map(k => k.t), [1, 2]);
  assert.equal(kf[1].s, 1.5);
  // Split at 4.5 s: each half keeps a keyframe at the cut, so the motion carries on.
  await page.mouse.click(ruler.x + 4.5 * PPS, ruler.y + 10);
  await page.evaluate(() => document.activeElement.blur()); // 's' would be typed into the field
  await page.keyboard.press('s');
  await page.locator('.tl-item.k-clips').nth(3).waitFor();
  await saved();
  const { clips } = await onDisk();
  assert.deepEqual(clips[1].kf.map(k => k.t), [1, 1.5]);
  assert.equal(clips[2].kf[0].t, 0);
  assert.equal(clips[2].kf[1].t, 0.5);
  assert.equal(clips[2].kf[1].s, 1.5);
});

uiTest('captions from audio: without Whisper the install dialog asks first, and cancelling downloads nothing', async t => {
  await open(t, { audio: 'talk.wav' });
  await page.getByRole('button', { name: /Uit audio|From audio/ }).click();
  const dlg = page.locator('#dlg-whisper');
  await dlg.waitFor();
  assert.equal(await dlg.locator('input[type=radio]').count(), 2);
  assert.equal(await dlg.locator('input[type=radio]:checked').getAttribute('value'), 'small');
  await dlg.getByRole('button', { name: /Annuleren|Cancel/ }).click();
  assert.equal(await dlg.evaluate(d => d.open), false);
  assert.equal(await page.locator('#dlg-job').evaluate(d => d.open), false, 'no job was started');
  // Without an audio track the button is disabled.
  await open(t);
  assert.equal(await page.getByRole('button', { name: /Uit audio|From audio/ }).isDisabled(), true);
});

// A 6 s clip with a tone for 2 s, silence for 2 s and a tone again (needs ffmpeg; the tests below are skipped without).
const { spawnSync } = await import('node:child_process');
const hasFfmpeg = !spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=90x160:rate=15:duration=6',
  '-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,2\\,4)\\,0\\,0.5*sin(2*PI*440*t)):s=44100:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(ws, 'assets', 'clips', 'talk.mp4')], { windowsHide: true }).status;
const soundTest = (name, fn) => test(name, { skip: browser && hasFfmpeg ? false : 'needs Chrome or Edge and ffmpeg' }, fn);
const talk = { clips: [{ src: 'talk.mp4', start: 0.5, dur: 6, media: 0 }], dur: 10, end: 8 };

soundTest('cut silence: a clip with sound loses its silent stretch and everything after it moves up', async t => {
  await open(t, { ...talk, heads: [{ t: 5, text: 'Later' }] });
  page.on('dialog', d => d.accept());
  await clip(0).click();
  await page.getByLabel(/Geluid van de clip|Sound of the clip/).check();
  await page.getByRole('button', { name: /Stilte knippen|Cut silence/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.tl-item.k-clips').length === 2);
  await saved();
  const v = await onDisk();
  assert.equal(v.clips.length, 2);
  assert.equal(v.clips[0].sound, true);
  const cut = v.clips[1].media - v.clips[0].dur; // source seconds thrown away
  assert.ok(cut > 1.5 && cut < 2.1, `cut ${cut}s`);
  assert.equal(v.clips[1].start, +(v.clips[0].start + v.clips[0].dur).toFixed(3), 'closed up');
  assert.ok(Math.abs(v.dur - (10 - cut)) < 0.02, 'the video got shorter by what was cut');
  assert.ok(Math.abs(v.heads[0].t - (5 - cut)) < 0.02, 'later items moved up');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.tl-item.k-clips').length === 1);
});

soundTest('cut words: picked words leave the video, the caption keeps the rest', async t => {
  await open(t, { ...talk, subs: [{ t: 1, out: 5, text: 'een twee drie vier', wo: [0, 1, 2, 3] }] });
  page.on('dialog', d => d.accept());
  await page.locator('.tl-item.k-sub').click();
  await page.locator('.words .word', { hasText: 'twee' }).click();
  await page.getByRole('button', { name: /Knip uit video|Cut from video/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.tl-item.k-clips').length === 2);
  await saved();
  const v = await onDisk();
  assert.equal(v.subs[0].text, 'een drie vier');
  assert.deepEqual(v.subs[0].wo, [0, 1, 2]);
  assert.equal(v.clips.length, 2);
  assert.equal(v.clips[0].dur, 1.5); // the clip runs from 0.5 s to the word at 1 + 1 = 2 s
  assert.equal(v.dur, 9);
});

uiTest('projects dialog: a project can be taken off the list, its folder stays', async t => {
  const other = join(home, 'other-project');
  createWorkspace(other, 'Other');
  const post = (path, body) => fetch(`${url}/api/workspace/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('open', { path: other }); await post('open', { path: ws }); // recents: ws, other
  await open(t);
  page.on('dialog', d => d.accept());
  await page.locator('#btn-project').click();
  const rows = page.locator('#recent-list .recent-row');
  await rows.first().waitFor();
  const before = await rows.count();
  assert.ok(before >= 2);
  // No recycle bin outside the app: only the "off the list" button.
  assert.equal(await rows.first().locator('button.icon').count(), 1);
  await rows.filter({ hasText: 'other-project' }).locator('button.icon').click();
  await page.waitForFunction(n => document.querySelectorAll('#recent-list .recent-row').length === n - 1, before);
  assert.equal(await rows.filter({ hasText: 'other-project' }).count(), 0);
  assert.ok((await (await fetch(`${url}/api/state`)).json()).workspace.path === ws, 'the open project stays open');
});

uiTest('a tap can become a swipe or a long press, and the timeline block grows with it', async t => {
  await open(t, { taps: [{ t: 1, x: 300, y: 600 }] });
  const block = page.locator('.tl-item.k-tap');
  const w0 = (await block.boundingBox()).width;
  await block.click();
  // The dropdowns are styled popovers over native selects (which stay the source of truth): set the select itself.
  const choose = value => page.locator('label.field', { hasText: /^(Soort|Kind)/ }).locator('select').evaluate((sel, v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  await choose('swipe');
  await saved();
  let tap = (await onDisk()).taps[0];
  assert.deepEqual([tap.x2, tap.dur], [300, 0.4]);
  assert.ok(tap.y2 < tap.y, 'the swipe goes up');
  assert.ok((await block.boundingBox()).width > w0, 'the block covers the whole swipe');
  await page.getByLabel(/Duur swipe|Swipe length/).fill('1');
  await choose('hold');
  await saved();
  tap = (await onDisk()).taps[0];
  assert.equal(tap.hold, 0.8);
  assert.equal(tap.x2, undefined);
  assert.equal(tap.dur, undefined);
});

// ---- the demo studio: a real Chrome plays the device, the editor's Chrome drives the canvas ----
const { findChrome } = await import('../../src/cdp.mjs');
const { default: http } = await import('node:http');
const { readFileSync } = await import('node:fs');
const demoApp = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(new URL('../fixtures/demo-app.html', import.meta.url), 'utf8')); });
await new Promise(ok => demoApp.listen(0, '127.0.0.1', ok));
after(() => demoApp.close());
const demoTest = (name, fn) => test(name, { skip: browser && hasFfmpeg && findChrome() ? false : 'needs Chrome or Edge and ffmpeg' }, fn);

demoTest('demo studio: open an app, record taps, a swipe and filled-in data, and add it to the video with its taps', async t => {
  await open(t);
  await page.locator('#btn-demo').click();
  const dlg = page.locator('#dlg-demo');
  await dlg.waitFor();
  await dlg.locator('.demo-side input[list=demo-apps]').fill(`http://127.0.0.1:${demoApp.address().port}/`);
  await dlg.getByRole('button', { name: /(Openen|Open)$/ }).click();
  const canvas = dlg.locator('canvas.demo-canvas');
  await page.waitForFunction(() => { const c = document.querySelector('canvas.demo-canvas'); return c && c.width > 300 && c.offsetParent; }, null, { timeout: 20000 }); // a canvas is 300 wide until the first picture arrives
  assert.equal(await canvas.evaluate(c => [c.width, c.height]).then(([w, h]) => Math.round(h / w * 100)), 216, 'the picture has the shape of a phone'); // 780 × 1688

  await dlg.getByRole('button', { name: /Opname starten|Start recording/ }).click();
  await dlg.locator('.demo-recbtn.on').waitFor();
  const box = await canvas.boundingBox();
  const at = (cssX, cssY) => [box.x + cssX / 390 * box.width, box.y + cssY / 844 * box.height];
  // A tap on the button, and a swipe up over the list.
  let [x, y] = at(60, 50);
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(400);
  [x, y] = at(200, 650);
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.waitForTimeout(25); await page.mouse.move(x, y - i * 40 / 844 * box.height); }
  await page.mouse.up();
  await page.waitForTimeout(1500); // the page keeps scrolling for a moment
  await dlg.getByRole('button', { name: /Vul alle velden in|Fill all fields/ }).click();
  await page.waitForFunction(() => /1 tik|2 tik|3 tik|taps?/.test(document.querySelector('#demo-counts')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(6000); // typing takes a few seconds
  await dlg.getByRole('button', { name: /Stop opname|Stop recording/ }).click();
  await dlg.locator('video.demo-preview').waitFor({ timeout: 30000 });
  const summary = await dlg.locator('.demo-summary').textContent();
  assert.match(summary, /tik|tap/i);
  assert.match(summary, /swipe/i);

  await dlg.getByRole('button', { name: /Toevoegen aan deze video|Add to this video/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.tl-item.k-clips').length === 4, null, { timeout: 10000 });
  await saved();
  const v = await onDisk();
  const added = v.clips.find(c => /^demo-/.test(c.src));
  assert.ok(added && added.dur > 5, 'the recording is a clip of the video');
  assert.ok(v.taps.length >= 5, `taps ${v.taps.length}`);
  const first = v.taps[0];
  // The button at css (60, 50) is at (60, 50) × (616 / 390) on the screen, plus the phone's 12 px bezel.
  assert.ok(Math.abs(first.x - (12 + 60 * 616 / 390)) < 8 && Math.abs(first.y - (12 + 50 * 616 / 390)) < 8, `${JSON.stringify(v.taps.slice(0, 4))} box=${JSON.stringify(box)}`);
  assert.ok(first.t >= 0.3);
  assert.ok(v.taps.some(k => k.x2 != null && k.y2 < k.y), 'the swipe up is a swipe');
  assert.ok(await dlg.evaluate(d => !d.open), 'the studio closed');
});

demoTest('demo studio: the address field keeps its focus and text while the server sends news', async t => {
  await open(t);
  await page.locator('#btn-demo').click();
  const dlg = page.locator('#dlg-demo');
  await dlg.waitFor();
  const field = dlg.locator('.demo-side input[list=demo-apps]');
  await field.fill('');
  await field.click();
  await page.keyboard.type('http://127.0.0.1:');
  // A page opened behind the field makes the server send its state, as a real navigation does.
  await page.evaluate(async url => { await fetch('/api/demo/open', { method: 'POST', body: JSON.stringify({ source: 'web', url, layout: 'phone' }) }); }, `http://127.0.0.1:${demoApp.address().port}/`);
  await page.waitForFunction(() => document.querySelector('canvas.demo-canvas')?.offsetParent, null, { timeout: 20000 });
  await page.keyboard.type('12345');
  assert.equal(await field.inputValue(), 'http://127.0.0.1:12345');
  assert.ok(await field.evaluate(el => el === document.activeElement), 'the field still has the focus');
});
