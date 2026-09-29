// Demo source: an Android phone or emulator over adb. The live picture is a series of screenshots (`screencap`), taps and
// swipes go back through `adb shell input`, and fields are found with `uiautomator dump`. The recording is made by
// `screenrecord` on the device itself (so its timestamps are exact, unlike a stream) and pulled when it stops.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickValue, typingPlan } from './demo.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ANDROID_CSS_WIDTH = 390; // events are in this many "css" pixels across, like a phone in the browser

// ---------- finding adb ----------
export function findAdb(preferred = '') {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const env = process.env, list = [preferred];
  for (const sdk of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Android', 'Sdk'), join(homedir(), 'Library', 'Android', 'sdk'), join(homedir(), 'Android', 'Sdk')].filter(Boolean)) list.push(join(sdk, 'platform-tools', exe));
  const found = list.find(p => p && existsSync(p));
  if (found) return found;
  try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['adb'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim(); } catch { return ''; }
}

// ---------- parsing what adb prints ----------
// `adb devices -l` → [{ serial, state, model, name }]
export function parseDevices(text) {
  return String(text).split(/\r?\n/).slice(1).map(l => l.trim()).filter(Boolean).map(l => {
    const [serial, state, ...rest] = l.split(/\s+/);
    const model = /model:(\S+)/.exec(rest.join(' '))?.[1] || '';
    return { serial, state, model, name: (model || serial).replace(/_/g, ' ') };
  }).filter(d => d.serial && d.state && !/^\*/.test(d.serial));
}
// `wm size` → [w, h] (an override wins over the physical size).
export function parseWmSize(text) {
  const all = [...String(text).matchAll(/(Physical|Override) size:\s*(\d+)x(\d+)/g)];
  const pick = all.find(m => m[1] === 'Override') || all[0];
  return pick ? [+pick[2], +pick[3]] : null;
}
// The nodes of a `uiautomator dump`: [{ cls, id, text, hint, desc, focused, enabled, password, bounds: [l, t, r, b] }].
export function parseUiDump(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<node\b([^>]*)>/g)) {
    const attr = name => { const a = new RegExp(`\\b${name}="([^"]*)"`).exec(m[1]); return a ? a[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : ''; };
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr('bounds'));
    if (!b) continue;
    out.push({ cls: attr('class'), id: attr('resource-id'), text: attr('text'), hint: attr('hint'), desc: attr('content-desc'), focused: attr('focused') === 'true', enabled: attr('enabled') !== 'false', password: attr('password') === 'true', bounds: [+b[1], +b[2], +b[3], +b[4]] });
  }
  return out;
}
// The text fields among them, as the hints pickValue reads; x/y/w/h in css pixels (`k` = device pixels per css pixel).
export function fieldsFromDump(nodes, k = 1, [W, H] = [Infinity, Infinity]) {
  return nodes.filter(n => /EditText|AutoCompleteTextView|SearchView/.test(n.cls) && n.enabled).map(n => {
    const [l, t, r, b] = n.bounds, idName = n.id.split('/').pop() || '';
    const empty = !n.text || n.text === n.hint;
    return { tag: 'input', type: n.password ? 'password' : /search/i.test(idName + n.cls) ? 'search' : '', name: idName, id: idName, placeholder: n.hint || (empty ? n.text : ''), label: n.desc, aria: n.desc, autocomplete: '',
      value: empty ? '' : n.text, focused: n.focused, x: (l + r) / 2 / k, y: (t + b) / 2 / k, w: (r - l) / k, h: (b - t) / k, visible: r > 0 && b > 0 && l < W && t < H };
  }).filter(f => f.visible && f.w > 8 && f.h > 8);
}
// Text as `adb shell input text` wants it: spaces are %s and shell characters need a backslash.
export function escapeInputText(ch) {
  if (ch === ' ') return '%s';
  return /^[A-Za-z0-9@._\-+=:,/]$/.test(ch) ? ch : `\\${ch}`;
}
export const canTypeOverAdb = ch => ch.charCodeAt(0) < 127 && ch.charCodeAt(0) >= 32;

// ---------- adb calls ----------
const adbRun = (adb, run, serial, args, opts) => run(adb, ['-s', serial, ...args], opts);
export async function listAndroidDevices(adb, run) {
  if (!adb) return [];
  return parseDevices(await run(adb, ['devices', '-l']));
}

const KEYS = { Enter: 66, Backspace: 67, Delete: 112, Tab: 61, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, Escape: 4 };
const BUTTONS = { back: 4, home: 3, recents: 187 };

export class AndroidDemo {
  constructor(o, hooks) {
    Object.assign(this, o); this.onFrame = hooks?.onFrame; this.onNav = hooks?.onNav;
    this.rec = null; this.last = null; this.g = null; this.closed = false; this.url = ''; this.hotUntil = 0; this.shotProc = null;
  }

  static async open({ adb, serial, run }, hooks = {}) {
    if (!adb) throw new Error('adb niet gevonden. Installeer de Android platform-tools of zet het pad bij Instellingen.');
    if (!serial) throw new Error('Kies eerst een apparaat.');
    const state = parseDevices(await run(adb, ['devices', '-l'])).find(d => d.serial === serial);
    if (!state) throw new Error(`Apparaat ${serial} niet gevonden.`);
    if (state.state !== 'device') throw new Error(state.state === 'unauthorized' ? 'Het apparaat wacht op toestemming: bevestig "USB-foutopsporing toestaan" op de telefoon.' : `Het apparaat is niet bereikbaar (${state.state}).`);
    const size = parseWmSize(await adbRun(adb, run, serial, ['shell', 'wm', 'size']));
    if (!size) throw new Error('Kon de schermgrootte niet lezen.');
    const css = [ANDROID_CSS_WIDTH, Math.round(ANDROID_CSS_WIDTH * size[1] / size[0])];
    const d = new AndroidDemo({ adb, serial, run, size, css, dsf: size[0] / css[0], k: size[0] / css[0], name: state.name }, hooks);
    d.hotUntil = Date.now() + 3000;
    d.watch();
    return d;
  }

  // ---- the live picture ----
  // A screenshot of the device (PNG bytes). One at a time.
  screenshot(timeout = 8000) {
    return new Promise((ok, fail) => {
      const p = spawn(this.adb, ['-s', this.serial, 'exec-out', 'screencap', '-p'], { windowsHide: true });
      this.shotProc = p;
      const parts = [];
      const timer = setTimeout(() => { try { p.kill(); } catch {} fail(new Error('Het apparaat reageert niet.')); }, timeout);
      p.stdout.on('data', c => parts.push(c)); p.stderr.on('data', () => {});
      p.on('error', e => { clearTimeout(timer); fail(e); });
      p.on('close', () => { clearTimeout(timer); const buf = Buffer.concat(parts); buf.length > 100 && buf[0] === 0x89 ? ok(buf) : fail(new Error('Geen schermafbeelding ontvangen.')); });
    });
  }
  // Keeps the picture fresh: quickly while something is happening (a recording, or just after input), slowly otherwise.
  async watch() {
    let previous = null, failures = 0;
    while (!this.closed) {
      try {
        const png = await this.screenshot();
        failures = 0;
        if (!previous || !previous.equals(png)) { previous = png; const b64 = png.toString('base64'); this.last = { data: b64, ts: Date.now() / 1000 }; this.onFrame?.(b64, this.last.ts); }
      } catch (e) { if (++failures > 6) { this.closed = true; this.error = e; return; } }
      await sleep(this.rec || Date.now() < this.hotUntil ? 30 : 700);
    }
  }

  // ---- input ----
  log(ev, at = Date.now()) { if (this.rec?.t0) this.rec.events.push({ ...ev, t: +((at - this.rec.t0) / 1000).toFixed(3) }); }
  px(v) { return Math.round(v * this.k); }
  shell(...args) { return adbRun(this.adb, this.run, this.serial, ['shell', ...args]); }

  // A finger on the canvas is a gesture on the phone once it is over: a tap, a long press or a swipe of the same length.
  // The log gets the gesture at the time the phone did it, not when the finger went down.
  async input(ev) {
    const { x = 0, y = 0 } = ev;
    this.hotUntil = Date.now() + 3000;
    if (ev.type === 'down') this.g = { t: Date.now(), x, y, lx: x, ly: y };
    else if (ev.type === 'move' && this.g) { this.g.lx = x; this.g.ly = y; }
    else if (ev.type === 'up' && this.g) {
      const g = this.g; this.g = null;
      const ex = ev.x ?? g.lx, ey = ev.y ?? g.ly, dur = Math.max(60, Date.now() - g.t), dist = Math.hypot(ex - g.x, ey - g.y);
      const start = Date.now();
      if (dist < 10) {
        if (dur > 500) await this.shell('input', 'swipe', this.px(g.x), this.px(g.y), this.px(g.x), this.px(g.y), Math.min(dur, 3000));
        else await this.shell('input', 'tap', this.px(g.x), this.px(g.y));
        this.log({ type: 'down', x: g.x, y: g.y }, start); this.log({ type: 'up', x: g.x, y: g.y }, start + (dur > 500 ? Math.min(dur, 3000) : 60));
      } else {
        const d = Math.min(1500, Math.max(120, dur));
        await this.shell('input', 'swipe', this.px(g.x), this.px(g.y), this.px(ex), this.px(ey), d);
        this.log({ type: 'down', x: g.x, y: g.y }, start); this.log({ type: 'move', x: ex, y: ey }, start + d / 2); this.log({ type: 'up', x: ex, y: ey }, start + d);
      }
    } else if (ev.type === 'wheel') {
      const horizontal = Math.abs(ev.dx || 0) > Math.abs(ev.dy || 0), amount = Math.max(120, Math.min(this.css[horizontal ? 0 : 1] * 0.5, Math.abs(horizontal ? ev.dx : ev.dy) * 0.8));
      const sign = (horizontal ? ev.dx : ev.dy) > 0 ? -1 : 1; // the page moves up when the finger does
      const x2 = horizontal ? x + sign * amount / 2 : x, y2 = horizontal ? y : y + sign * amount / 2, x1 = horizontal ? x - sign * amount / 2 : x, y1 = horizontal ? y : y - sign * amount / 2;
      const start = Date.now();
      await this.shell('input', 'swipe', this.px(x1), this.px(y1), this.px(x2), this.px(y2), 250);
      this.log({ type: 'down', x: x1, y: y1 }, start); this.log({ type: 'up', x: x2, y: y2 }, start + 250);
    } else if (ev.type === 'button') {
      if (BUTTONS[ev.name]) await this.shell('input', 'keyevent', BUTTONS[ev.name]);
    } else if (ev.type === 'key') {
      if (ev.key?.length === 1 && !ev.ctrl && !ev.alt) {
        if (!canTypeOverAdb(ev.key)) return;
        this.log({ type: 'text', text: ev.key });
        await this.shell('input', 'text', escapeInputText(ev.key));
      } else if (KEYS[ev.key]) await this.shell('input', 'keyevent', KEYS[ev.key]);
    }
  }

  // ---- demo data ----
  async dump() {
    const out = await adbRun(this.adb, this.run, this.serial, ['exec-out', 'uiautomator', 'dump', '/dev/tty']);
    return parseUiDump(out);
  }
  async fieldList() { return fieldsFromDump(await this.dump(), this.k, this.size); }
  async type(text, seed = 7) {
    const plan = typingPlan(text, seed);
    let i = 0;
    for (const ch of text) { await sleep(Math.max(0, plan[i++] - 60)); await this.input({ type: 'key', key: ch }); }
  }
  async typeFocused(text) {
    if (!(await this.fieldList()).some(f => f.focused)) throw new Error('Tik eerst op een invulveld in de app.');
    await this.type(text);
  }
  async fill(dataset, mode = 'focused') {
    const fields = await this.fieldList();
    if (mode === 'focused') {
      const f = fields.find(x => x.focused);
      if (!f) throw new Error('Tik eerst op een invulveld in de app.');
      const pick = pickValue(dataset, f);
      if (!pick) throw new Error('Deze dataset heeft niets voor dit veld.');
      // Type over what is there: select all (Ctrl+A) is not reliable over adb, so clear with backspaces.
      for (let i = 0; i < (f.value || '').length; i++) await this.shell('input', 'keyevent', 67);
      await this.type(pick.value);
      return [{ ...pick }];
    }
    const done = [];
    for (const f of fields) {
      if (f.value) continue;
      const pick = pickValue(dataset, f);
      if (!pick) continue;
      await this.input({ type: 'down', x: f.x, y: f.y }); await sleep(60); await this.input({ type: 'up', x: f.x, y: f.y });
      await sleep(500);
      await this.type(pick.value, done.length + 3);
      done.push({ ...pick });
      await sleep(400);
    }
    if (!done.length) throw new Error('Geen lege velden gevonden die bij deze dataset passen.');
    return done;
  }

  // ---- recording ----
  // `screenrecord` writes an mp4 on the device with the real time of every frame. Its start is when that file appears.
  async startRecording() {
    if (this.rec) throw new Error('Er wordt al opgenomen.');
    const dir = join(tmpdir(), `ms-demo-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const remote = `/sdcard/ms-demo-${Date.now()}.mp4`;
    const proc = spawn(this.adb, ['-s', this.serial, 'shell', 'screenrecord', '--bit-rate', '8000000', '--time-limit', '180', remote], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => (err += d));
    proc.exit = new Promise(ok => proc.on('close', code => ok(code)));
    let exited = null;
    proc.exit.then(code => { exited = code; });
    this.rec = { dir, remote, proc, t0: 0, events: [] };
    const until = Date.now() + 8000;
    while (Date.now() < until && exited === null) {
      const ls = await this.shell('ls', remote).catch(() => '');
      if (ls.includes(remote) && !/No such file/i.test(ls)) { this.rec.t0 = Date.now(); break; }
      await sleep(60);
    }
    if (!this.rec.t0) { const why = err.trim() || 'de opname op het apparaat startte niet'; this.discard(this.rec); this.rec = null; throw new Error(`Kon niet opnemen: ${why}`); }
    return this.rec.t0;
  }
  async stopRecording() {
    const rec = this.rec;
    if (!rec) throw new Error('Er wordt niet opgenomen.');
    const t1 = Date.now();
    this.rec = null;
    await this.shell('kill -2 $(pidof screenrecord)').catch(() => {}); // SIGINT: screenrecord finishes the file properly
    await Promise.race([rec.proc.exit, sleep(6000)]);
    const raw = join(rec.dir, 'device.mp4'), out = join(rec.dir, 'rec.mp4');
    await adbRun(this.adb, this.run, this.serial, ['pull', rec.remote, raw]);
    await this.shell('rm', rec.remote).catch(() => {});
    if (!existsSync(raw) || statSync(raw).size < 100) throw new Error('De opname kon niet van het apparaat gehaald worden.');
    // Constant frame rate, even sizes, and the last picture held until the moment the recording stopped.
    const want = (t1 - rec.t0) / 1000, have = mediaSeconds(raw), pad = Math.max(0, want - have);
    await this.run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-vf', `fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2${pad > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : ''}`, '-t', want.toFixed(3), '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    // The phone reacts a moment after an input is sent (adb starts a shell, the phone handles the touch, draws and encodes).
    // The recording is measured for the real delay; this is only the guess for one where no tap changed the picture.
    return { file: out, dir: rec.dir, dur: +want.toFixed(2), events: rec.events, t0: rec.t0, t1, sync: 0.3 };
  }
  discard(rec) { if (rec?.dir) rmSync(rec.dir, { recursive: true, force: true }); }

  async close() {
    this.closed = true;
    try { this.shotProc?.kill(); } catch {}
    if (this.rec) {
      const rec = this.rec; this.rec = null;
      await this.shell('kill -2 $(pidof screenrecord)').catch(() => {});
      await this.shell('rm', rec.remote).catch(() => {});
      this.discard(rec);
    }
  }
}

function mediaSeconds(file) {
  try { return +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true }).trim() || 0; } catch { return 0; }
}
