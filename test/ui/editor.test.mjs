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
async function open(t) {
  await fetch(`${url}/api/videos/ui-test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...spec, id: 'ui-test' }) });
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

uiTest('panel edges can be dragged, are remembered, and reset with a double-click', async t => {
  await open(t);
  const width = sel => page.locator(sel).evaluate(n => n.getBoundingClientRect().width);
  const g = await page.locator('.gutter.lib').boundingBox();
  await page.mouse.move(g.x + g.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 100, 300, { steps: 5 });
  await page.mouse.up();
  assert.equal(Math.round(await width('#library')), 350);
  await page.reload();
  await page.locator('.tl-item').first().waitFor();
  assert.equal(Math.round(await width('#library')), 350, 'remembered');
  await page.locator('.gutter.lib').dblclick();
  assert.equal(Math.round(await width('#library')), 250);
});
