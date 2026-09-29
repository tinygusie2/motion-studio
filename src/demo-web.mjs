// Demo source: a web app in a Chrome page that looks like the device of the layout (its screen size, pixel density,
// touch input). The page is shown live (screencast frames), operated with forwarded pointer events, and recorded as
// frames plus a log of what the user did.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickValue, storageScript, storageEntries, typingPlan } from './demo.mjs';

// What the page pretends to be for each layout. The CSS size has the shape of the layout's screen, so a recording fills
// it; `dsf` is the pixel density (the frames are css × dsf).
const devices = {
  phone: { css: [390, 844], dsf: 2, high: 3, mobile: true },
  dual: { css: [390, 844], dsf: 2, high: 3, mobile: true },
  tablet: { css: [768, 1045], dsf: 2, high: 2, mobile: true },
  browser: { css: [1280, 814], dsf: 1, high: 1.5, mobile: false },
  full: { css: [540, 960], dsf: 2, high: 2, mobile: true }
};
export const deviceFor = (layout, quality = 'standard') => { const d = devices[layout] || devices.phone; return { css: d.css, dsf: quality === 'high' ? d.high : d.dsf, mobile: d.mobile }; };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The hints of an input, read in the page: what kind of field it is and where.
const HINTS = `(el) => {
  if (!el) return null;
  const label = (el.labels && el.labels[0] && el.labels[0].textContent) || (el.closest && el.closest('label') && el.closest('label').textContent) || '';
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '', placeholder: el.placeholder || '', label: String(label).trim().slice(0, 60),
    autocomplete: el.autocomplete || '', aria: el.getAttribute('aria-label') || '', value: el.value || '', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}`;
const FIELDS = `(() => {
  const hints = ${HINTS};
  const sel = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=file]):not([type=range]):not([type=color]):not([type=image]), textarea';
  return [...document.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return !el.disabled && !el.readOnly && r.width > 8 && r.height > 8 && st.visibility !== 'hidden' && st.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }).map(hints);
})()`;

export class WebDemo {
  constructor(page, dev, { onFrame, onNav } = {}) {
    this.page = page; this.dev = dev; this.onFrame = onFrame; this.onNav = onNav;
    this.down = false; this.rec = null; this.last = null; this.url = '';
  }

  // Opens `url` on a page that acts as the device. `dataset` (optional) is put in the page's storage before the app runs.
  static async open(browser, { url, layout = 'phone', quality = 'standard', dataset } = {}, hooks = {}) {
    const dev = deviceFor(layout, quality);
    const page = await browser.newPage();
    const d = new WebDemo(page, dev, hooks);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: dev.css[0], height: dev.css[1], deviceScaleFactor: dev.dsf, mobile: dev.mobile, screenWidth: dev.css[0], screenHeight: dev.css[1] });
    if (dev.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // Look like a normal browser of that device, not like a headless test browser.
    const ua = String((await page.send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true })).result.value || '');
    const ver = /Chrome\/([\d.]+)/.exec(ua)?.[1] || '124.0.0.0';
    await page.send('Emulation.setUserAgentOverride', { userAgent: dev.mobile ? `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Mobile Safari/537.36` : ua.replace('HeadlessChrome', 'Chrome') });
    const script = storageScript(dataset);
    if (script) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
    if (url && dataset) for (const c of storageEntries(dataset).cookies) await page.send('Network.setCookie', { name: c.name, value: String(c.value ?? ''), url }).catch(() => {});
    page.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      d.gotFrame(data, metadata?.timestamp || Date.now() / 1000);
    });
    page.on('Page.frameNavigated', ({ frame }) => { if (!frame.parentId) { d.url = frame.url; d.onNav?.(frame.url); } });
    if (url) await d.navigate(url);
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: Math.round(dev.css[0] * dev.dsf), maxHeight: Math.round(dev.css[1] * dev.dsf), everyNthFrame: 1 });
    return d;
  }

  gotFrame(b64, ts) {
    this.last = { data: b64, ts };
    this.onFrame?.(b64, ts);
    if (this.rec && ts >= this.rec.t0 / 1000) this.saveFrame(b64, ts);
  }
  saveFrame(b64, ts) {
    const rec = this.rec, file = join(rec.dir, `f${String(++rec.n).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(b64, 'base64'));
    rec.frames.push({ file, ts });
  }

  async navigate(url) {
    const loaded = new Promise(ok => { this.page.on('Page.loadEventFired', ok); setTimeout(ok, 20000); });
    const r = await this.page.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`Kon ${url} niet openen: ${r.errorText}`);
    await loaded;
    await sleep(250);
  }
  async history(action) {
    if (action === 'reload') return this.page.send('Page.reload');
    const { currentIndex, entries } = await this.page.send('Page.getNavigationHistory');
    const to = entries[currentIndex + (action === 'back' ? -1 : 1)];
    if (to) await this.page.send('Page.navigateToHistoryEntry', { entryId: to.id });
  }
  async title() { return String((await this.page.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value || ''); }

  // ---- input: events from the demo view, in the device's CSS pixels ----
  log(ev) { if (this.rec) this.rec.events.push({ ...ev, t: +((Date.now() - this.rec.t0) / 1000).toFixed(3) }); }
  async input(ev) {
    const { page, dev } = this, { x = 0, y = 0 } = ev;
    if (ev.type === 'down') {
      this.down = true; this.log({ type: 'down', x, y });
      if (dev.mobile) await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      else await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    } else if (ev.type === 'move') {
      if (this.down) {
        this.log({ type: 'move', x, y });
        if (dev.mobile) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
        else await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      } else if (!dev.mobile) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    } else if (ev.type === 'up') {
      this.log({ type: 'up', x, y });
      if (this.down) {
        if (dev.mobile) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      }
      this.down = false;
    } else if (ev.type === 'wheel') {
      this.log({ type: 'wheel', x, y, dx: ev.dx || 0, dy: ev.dy || 0 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: ev.dx || 0, deltaY: ev.dy || 0 });
    } else if (ev.type === 'key') {
      const printable = ev.key?.length === 1 && !ev.ctrl && !ev.alt;
      if (printable) this.log({ type: 'text', text: ev.key });
      const mods = (ev.alt ? 1 : 0) | (ev.ctrl ? 2 : 0) | (ev.shift ? 8 : 0);
      await page.send('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown', key: ev.key, code: ev.code, modifiers: mods, windowsVirtualKeyCode: ev.keyCode || 0, ...(printable && { text: ev.key, unmodifiedText: ev.key }) });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ev.key, code: ev.code, modifiers: mods, windowsVirtualKeyCode: ev.keyCode || 0 });
    }
  }

  // ---- demo data ----
  async evaluate(expression) { const r = await this.page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result?.value; }
  async focusedHints() { return this.evaluate(`(${HINTS})(document.activeElement && document.activeElement.matches('input, textarea') ? document.activeElement : null)`); }
  async fieldList() { return (await this.evaluate(FIELDS)) || []; }

  // Waits until the screen has stopped changing (the screencast only sends frames when something moves).
  async settle(quiet = 250, timeout = 3000) {
    const end = Date.now() + timeout;
    while (Date.now() < end && this.last && Date.now() / 1000 - this.last.ts < quiet / 1000) await sleep(50);
  }
  // Types `text` the way a person does (varying speed), into whatever has focus. It replaces what is in the field.
  async type(text, seed = 7) {
    await this.evaluate(`(() => { const e = document.activeElement; if (e && e.select) e.select(); })()`);
    const plan = typingPlan(text, seed);
    let i = 0;
    for (const ch of text) {
      await sleep(plan[i++]);
      await this.input({ type: 'key', key: ch });
    }
  }
  async typeFocused(text) {
    if (!(await this.focusedHints())) throw new Error('Klik eerst op een invulveld in de app.');
    await this.type(text);
  }
  // Fills what has focus (mode 'focused') or every visible empty field one after the other, tapping each (mode 'all').
  // Returns [{ kind, key, value }] of what was filled.
  async fill(dataset, mode = 'focused') {
    const done = [];
    if (mode === 'focused') {
      const hints = await this.focusedHints();
      if (!hints) throw new Error('Klik eerst op een invulveld in de app.');
      const pick = pickValue(dataset, hints);
      if (!pick) throw new Error('Deze dataset heeft niets voor dit veld.');
      await this.type(pick.value);
      return [{ ...pick }];
    }
    for (const f of await this.fieldList()) {
      if (f.value) continue;
      const pick = pickValue(dataset, f);
      if (!pick) continue;
      // A page still scrolling (after a swipe) uses the next tap to stop instead: wait until it is still, and tap
      // again when the field did not get the focus.
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.settle();
        await this.input({ type: 'move', x: f.x, y: f.y });
        await this.input({ type: 'down', x: f.x, y: f.y }); await sleep(70); await this.input({ type: 'up', x: f.x, y: f.y });
        await sleep(350);
        const now = await this.focusedHints();
        if (now && Math.abs(now.x - f.x) < 6 && Math.abs(now.y - f.y) < 6) break;
      }
      await this.type(pick.value, done.length + 3);
      done.push({ ...pick });
      await sleep(400);
    }
    if (!done.length) throw new Error('Geen lege velden gevonden die bij deze dataset passen.');
    return done;
  }

  // ---- recording ----
  async startRecording() {
    if (this.rec) throw new Error('Er wordt al opgenomen.');
    const dir = join(tmpdir(), `ms-demo-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    this.rec = { dir, t0: Date.now(), frames: [], events: [], n: 0 };
    await this.snapshot(this.rec.t0 / 1000); // the screen may be still: the recording still starts with what is on it
    return this.rec.t0;
  }
  async snapshot(ts) {
    const { data } = await this.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true });
    this.saveFrame(data, ts);
  }
  // → { dir, t0, t1, frames: [{ file, ts }], events }
  async stopRecording() {
    const rec = this.rec;
    if (!rec) throw new Error('Er wordt niet opgenomen.');
    await this.snapshot(Date.now() / 1000);
    this.rec = null;
    rec.frames.sort((a, b) => a.ts - b.ts);
    return { ...rec, t1: Date.now() };
  }
  discard(rec) { if (rec?.dir) rmSync(rec.dir, { recursive: true, force: true }); }

  async close() {
    try { await this.page.send('Page.stopScreencast'); } catch {}
    if (this.rec) this.discard(this.rec);
    this.rec = null;
    await this.page.close();
  }
}

// The frames of a recording as a constant-frame-rate mp4 (ffmpeg's concat demuxer holds each frame until the next one).
// `run(cmd, args)` is the app's process runner.
export async function encodeFrames(rec, out, run, { fps = 30 } = {}) {
  const t0 = rec.t0 / 1000, t1 = Math.max(rec.t1 / 1000, t0 + 0.2);
  const frames = rec.frames.filter(f => f.ts <= t1);
  if (!frames.length) throw new Error('Er zijn geen beelden opgenomen.');
  const lines = [];
  frames.forEach((f, i) => {
    const start = Math.max(f.ts, t0), end = Math.min(i + 1 < frames.length ? frames[i + 1].ts : t1, t1);
    lines.push(`file '${f.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${Math.max(1 / 240, end - start).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`); // the concat demuxer ignores the last duration
  const list = join(rec.dir, 'frames.txt');
  writeFileSync(list, lines.join('\n'));
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, '-t', (t1 - t0).toFixed(3), '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-movflags', '+faststart', out]);
  return +(t1 - t0).toFixed(2);
}
