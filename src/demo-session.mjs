// The demo recorder's server side: one open session at a time (a web app in a Chrome page, or an Android device), its
// live picture for the editor, the input the editor forwards, the recording, and the demo data.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchBrowser } from './cdp.mjs';
import { WebDemo, encodeFrames } from './demo-web.mjs';
import { AndroidDemo, findAdb, listAndroidDevices } from './demo-android.mjs';
import { analyzeGestures } from './gestures.mjs';
import { sceneChanges, estimateDelay } from './latency.mjs';
import { defaultDatasets } from './demo.mjs';
import { layouts } from './template.mjs';

const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14).replace(/^(\d{8})/, '$1-');

export function createDemoManager({ getWorkspace, getSettings, run }) {
  let browser = null, session = null, info = null, busy = false;
  const viewers = new Set(); // SSE responses that get every frame

  const status = () => ({
    open: !!session, ...(info || {}), recording: !!session?.rec, since: session?.rec?.t0 || null,
    url: session?.url || info?.url || '', chrome: !!findChrome(getSettings().chrome), adb: !!findAdb(getSettings().adb)
  });

  function pushFrame(b64) {
    for (const res of viewers) {
      if (res.writableNeedDrain) continue; // a slow viewer skips frames rather than falling behind
      res.write(`data: ${b64}\n\n`);
    }
  }
  function pushMeta() { for (const res of viewers) res.write(`event: meta\ndata: ${JSON.stringify(status())}\n\n`); }

  async function close() {
    const s = session;
    session = null; info = null;
    if (s) await s.close().catch(() => {});
    pushMeta();
  }
  async function shutdown() { await close(); browser?.close(); browser = null; for (const res of viewers) res.end(); viewers.clear(); }

  // ---- demo data (datasets and remembered apps) in <project>/demo.json ----
  const dataFile = () => join(getWorkspace().root, 'demo.json');
  function readData() {
    const ws = getWorkspace();
    let saved = {};
    try { saved = JSON.parse(readFileSync(dataFile(), 'utf8')); } catch {}
    const lang = ws.brands?.()?.[0]?.lang || 'en';
    return { datasets: saved.datasets?.length ? saved.datasets : defaultDatasets(lang), apps: saved.apps || [] };
  }
  function writeData(data) {
    const clean = { datasets: (data.datasets || []).map(d => ({ id: String(d.id), name: String(d.name || d.id), fields: d.fields || {}, ...(d.storage && { storage: d.storage }) })), apps: (data.apps || []).map(a => ({ id: String(a.id), name: String(a.name || ''), url: String(a.url || ''), layout: a.layout || 'phone' })) };
    writeFileSync(dataFile(), JSON.stringify(clean, null, 2));
    return clean;
  }
  const datasetById = id => readData().datasets.find(d => d.id === id) || readData().datasets[0];

  // ---- session ----
  async function open(opts) {
    if (busy) throw new Error('Er wordt al iets geopend.');
    busy = true;
    try {
      await close();
      const layout = layouts[opts.layout] ? opts.layout : 'phone';
      const hooks = { onFrame: pushFrame, onNav: () => pushMeta() };
      if (opts.source === 'android') {
        session = await AndroidDemo.open({ adb: findAdb(getSettings().adb), serial: opts.serial, run }, hooks);
        info = { source: 'android', layout, serial: opts.serial, css: session.css, dsf: session.dsf, name: session.name };
      } else {
        const url = String(opts.url || '').trim();
        if (!/^(https?|file):\/\//i.test(url)) throw new Error('Geef een adres dat met http:// of https:// begint.');
        if (!browser?.alive) { browser?.close(); browser = null; }
        browser ??= await launchBrowser({ exe: findChrome(getSettings().chrome) });
        const dataset = opts.dataset ? datasetById(opts.dataset) : undefined;
        session = await WebDemo.open(browser, { url, layout, quality: opts.quality, dataset }, hooks);
        info = { source: 'web', layout, css: session.dev.css, dsf: session.dev.dsf, mobile: session.dev.mobile, quality: opts.quality || 'standard', dataset: dataset?.id || null };
      }
      pushMeta();
      return status();
    } finally { busy = false; }
  }
  const need = () => { if (!session) throw new Error('Er is geen demo geopend.'); return session; };

  async function input(events) { const s = need(); for (const ev of events) await s.input(ev); }
  // Fills the focused field from the dataset, every empty field ('all'), or types exactly `text` into the focused field.
  async function fill(datasetId, mode, text) {
    const s = need();
    if (text != null && text !== '') { await s.typeFocused(String(text)); return [{ kind: null, key: 'text', value: String(text) }]; }
    return s.fill(datasetById(datasetId), mode === 'all' ? 'all' : 'focused');
  }
  async function navigate(action, url) {
    const s = need();
    if (s.navigate === undefined) throw new Error('Dit kan alleen bij een webapp.');
    if (action === 'go') await s.navigate(url); else await s.history(action);
    pushMeta();
  }
  const startRecording = async () => { const t0 = await need().startRecording(); pushMeta(); return t0; };

  // Stops the recording and turns it into a clip of the project. The gestures come back for the editor to place.
  async function stopRecording() {
    const s = need(), w = getWorkspace(), rec = await s.stopRecording();
    pushMeta();
    mkdirSync(w.p.clips, { recursive: true });
    let name = `demo-${stamp()}.mp4`;
    for (let n = 2; existsSync(join(w.p.clips, name)); n++) name = `demo-${stamp()}-${n}.mp4`;
    const out = join(w.p.clips, name), tmp = `${out}.part.mp4`;
    let dur;
    try {
      if (rec.file) { copyFileSync(rec.file, tmp); dur = rec.dur; } else dur = await encodeFrames(rec, tmp, run);
      renameSync(tmp, out);
    } catch (e) { rmSync(tmp, { force: true }); throw e; } finally { s.discard?.(rec); }
    const css = info.css, gestures = analyzeGestures(rec.events, css);
    // How long the screen took to react to a tap: measured in the recording itself, since it differs per phone and
    // per connection. Without a tap that changed the picture, the source's own guess is all there is.
    let sync = rec.sync || 0, measured = 0;
    try {
      const est = estimateDelay(gestures, await sceneChanges(out, run));
      if (est.delay != null) { sync = est.delay; measured = est.samples.length; }
    } catch { /* the guess stays */ }
    return { clip: name, dur, css, layout: info.layout, source: info.source, sync, syncMeasured: measured, gestures, events: rec.events.length, size: statSync(out).size };
  }

  // ---- HTTP ----
  // Returns true when the request was for the demo recorder.
  async function route(p, method, req, res, { readJsonBody, send, url }) {
    if (!p.startsWith('/api/demo')) return false;
    if (p === '/api/demo/frames' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      viewers.add(res);
      res.write(`event: meta\ndata: ${JSON.stringify(status())}\n\n`);
      if (session?.last) res.write(`data: ${session.last.data}\n\n`);
      req.on('close', () => viewers.delete(res));
      return true;
    }
    if (p === '/api/demo/status' && method === 'GET') { send(res, 200, status()); return true; }
    if (p === '/api/demo/data') {
      if (method === 'GET') send(res, 200, readData());
      else if (method === 'PUT') send(res, 200, writeData(await readJsonBody(req)));
      else send(res, 405, { error: 'method' });
      return true;
    }
    if (p === '/api/demo/devices' && method === 'GET') { send(res, 200, { adb: !!findAdb(getSettings().adb), devices: await listAndroidDevices(findAdb(getSettings().adb), run).catch(() => []) }); return true; }
    if (method !== 'POST' && !(method === 'DELETE' && p === '/api/demo/session')) { send(res, 405, { error: 'method' }); return true; }
    if (p === '/api/demo/session' && method === 'DELETE') { await close(); send(res, 200, status()); return true; }
    const body = method === 'POST' ? await readJsonBody(req) : {};
    if (p === '/api/demo/open') { send(res, 200, await open(body)); return true; }
    if (p === '/api/demo/input') { await input(body.events || []); send(res, 200, { ok: true }); return true; }
    if (p === '/api/demo/fill') { send(res, 200, { filled: await fill(body.dataset, body.mode, body.text) }); return true; }
    if (p === '/api/demo/navigate') { await navigate(body.action, body.url); send(res, 200, status()); return true; }
    if (p === '/api/demo/record') {
      if (body.action === 'start') send(res, 200, { t0: await startRecording() });
      else send(res, 200, await stopRecording());
      return true;
    }
    send(res, 404, { error: 'not found' });
    return true;
  }

  return { route, shutdown, close, status };
}
