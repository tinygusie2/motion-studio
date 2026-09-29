// A small Chrome DevTools Protocol client: starts a Chrome (or Edge, or the headless Chrome HyperFrames keeps), and
// gives one page to drive. Used to show and record an app in a demo (src/demo-web.mjs). No dependencies: Node has a
// WebSocket of its own.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Where a Chrome-like browser is: the path from Settings, an installed Chrome or Edge, or the headless Chrome that
// HyperFrames downloads for rendering. Returns the first one that exists, or ''.
export function findChrome(preferred = '') {
  const env = process.env, list = [preferred];
  if (process.platform === 'win32') {
    for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)) {
      list.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    list.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  const found = list.find(p => p && existsSync(p));
  if (found) return found;
  // HyperFrames' own download: ~/.cache/hyperframes/chrome/<kind>/<version>/<folder>/chrome(-headless-shell)(.exe)
  const root = join(homedir(), '.cache', 'hyperframes', 'chrome');
  const walk = (dir, depth) => {
    if (!existsSync(dir) || depth > 4) return '';
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && /^chrome(-headless-shell)?(\.exe)?$/.test(e.name)) return join(dir, e.name);
      if (e.isDirectory()) { const f = walk(join(dir, e.name), depth + 1); if (f) return f; }
    }
    return '';
  };
  return walk(root, 0);
}

// One connection to a browser. `send(method, params, sessionId)` resolves with the result; `on(method, fn)` gets events
// as (params, sessionId).
class Connection {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.closed = false;
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.fail(new Error(`${p.method}: ${msg.error.message}`)); else p.ok(msg.result);
      } else for (const fn of this.handlers.get(msg.method) || []) fn(msg.params, msg.sessionId);
    });
    ws.addEventListener('close', () => { this.closed = true; for (const p of this.pending.values()) p.fail(new Error('De browser is gesloten.')); this.pending.clear(); });
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('De browser is gesloten.'));
    const id = ++this.id;
    return new Promise((ok, fail) => { this.pending.set(id, { ok, fail, method }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); });
  }
  on(method, fn) { (this.handlers.get(method) || this.handlers.set(method, []).get(method)).push(fn); }
}

// Starts the browser (headless, its own throwaway profile) and returns { newPage(), close() }. A page is
// { send(method, params), on(method, fn), close() }.
export async function launchBrowser({ exe, extraArgs = [] } = {}) {
  if (!exe) throw new Error('Geen Chrome of Edge gevonden. Installeer Chrome, of zet het pad bij Instellingen.');
  const dir = join(tmpdir(), `ms-chrome-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  mkdirSync(dir, { recursive: true });
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...extraArgs, 'about:blank'];
  // Tests move the home folder to a throwaway one, which Chrome on Windows does not start with: they set
  // MS_REAL_USERPROFILE to the real one.
  const env = { ...process.env, ...(process.env.MS_REAL_USERPROFILE && { USERPROFILE: process.env.MS_REAL_USERPROFILE }) };
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true, env });
  const onExit = () => { try { child.kill(); } catch {} };
  process.once('exit', onExit); // the browser must not outlive the app
  const cleanup = () => { process.off('exit', onExit); try { child.kill(); } catch {} setTimeout(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }), 500); };
  let dead = null;
  child.on('error', e => { dead = e; });
  child.on('exit', code => { dead ??= new Error(`De browser stopte direct (code ${code}).`); });
  try {
    // Chrome writes the port it listens on to DevToolsActivePort in its profile.
    let port = 0, path = '';
    for (let i = 0; i < 150 && !port; i++) {
      if (dead) throw dead;
      try { [port, path] = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/); port = +port; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    if (!port) throw new Error('De browser reageerde niet.');
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((ok, fail) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', () => fail(new Error('Kon niet met de browser verbinden.')), { once: true }); });
    const conn = new Connection(ws);
    return {
      exe,
      async newPage() {
        const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
        return {
          send: (method, params) => conn.send(method, params, sessionId),
          on: (method, fn) => conn.on(method, (params, sid) => { if (sid === sessionId) fn(params); }),
          close: () => conn.send('Target.closeTarget', { targetId }).catch(() => {})
        };
      },
      get alive() { return !conn.closed && !dead; },
      close() { try { ws.close(); } catch {} cleanup(); }
    };
  } catch (e) { cleanup(); throw e; }
}
