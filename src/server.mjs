// HTTP backend for the editor UI: workspace files, live preview, uploads, voice-over and render jobs.
// Used in-process by the Electron app (main.mjs), or standalone for development:
//   node src/server.mjs [--port 3400] [--workspace <dir>]
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, extname, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { layouts, formats, transitions, normalize, mediaOf, defaultTheme, defaultChipColors } from './template.mjs';
import { toSrt, wordsFromWhisper, subsFromWords } from './captions.mjs';
import { createDemoManager } from './demo-session.mjs';
import { parseSilences, silenceLevels, speechSegments, mapFromSegments } from './silence.mjs';
import { whisperStatus, installWhisper, whisperJson, cacheKey, whisperModels, defaultWhisperModel } from './whisper.mjs';
import { APP_ROOT, GSAP_FILE, Workspace, createWorkspace, isWorkspace, loadSettings, saveSettings, validId } from './workspace.mjs';

const UI = join(APP_ROOT, 'ui');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8','.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon' };
const PIPER = ['nl_NL-pim-medium', 'nl_NL-ronnie-medium', 'nl_BE-nathalie-medium'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

// ---------- small helpers ----------
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function sendFile(req, res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
  const size = statSync(file).size;
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? +range[1] : size - +range[2];
    const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}
const readBody = req => new Promise((ok, fail) => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail); });
const readJsonBody = async req => JSON.parse((await readBody(req)).toString('utf8') || '{}');
const clone = o => JSON.parse(JSON.stringify(o));
const inside = (dir, file) => resolve(file).startsWith(resolve(dir));
const slug = name => basename(name, extname(name)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'file';

// onSpawn gets the child process, so a job can stop it.
function run(cmd, args, opts = {}, onLine, onSpawn) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32' && cmd === 'npx', windowsHide: true, ...opts });
    onSpawn?.(p);
    let out = '';
    const take = d => { const s = d.toString(); out += s; if (onLine) s.split(/[\r\n]+/).forEach(onLine); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', err => fail(new Error(`${cmd} kon niet starten (${err.code || err.message}). Staat het in PATH?`)));
    p.on('close', code => code === 0 ? ok(out) : fail(new Error(`${cmd} stopte met code ${code}\n${out.slice(-1500)}`)));
  });
}
function wavSeconds(file) {
  const b = readFileSync(file);
  let byteRate = 0, i = 12;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(i + 16);
    if (id === 'data') return byteRate ? Math.min(size, b.length - i - 8) / byteRate : 0;
    i += 8 + size + (size % 2);
  }
  return 0;
}

// Tool locations: settings first, then the RepFlow-promo venv this app grew out of.
function tools(settings) {
  const legacy = join(homedir(), 'Documents', 'RepFlow-promo');
  const python = settings.python || [join(legacy, '.tts-venv', 'Scripts', 'python.exe')].find(existsSync) || '';
  const piperVoices = settings.piperVoices || [join(legacy, 'pww', 'vo', 'voices')].find(existsSync) || '';
  return { python, piperVoices, hf: settings.hyperframes || 'hyperframes@0.8.73' };
}

// `trash(path)` moves a folder to the recycle bin (the Electron app passes shell.trashItem); without it projects can
// only be taken off the list.
export async function startServer({ port = 3400, host = '127.0.0.1', workspace, trash } = {}) {
  let settings = loadSettings();
  let ws = null, demo = null;
  const jobs = new Map();

  function openWorkspace(dir) {
    dir = resolve(dir);
    ws = new Workspace(dir);
    settings.workspace = dir;
    settings.recents = [dir, ...settings.recents.map(r => resolve(r)).filter(r => r !== dir && isWorkspace(r))].slice(0, 8);
    saveSettings(settings);
    jobs.clear();
    demo?.close();
    return ws;
  }
  // Takes a project off the list of recent projects (its folder stays). When it was the open one, the next recent
  // project opens, or none.
  function forgetWorkspace(dir) {
    dir = resolve(dir);
    const wasOpen = ws && resolve(ws.root) === dir;
    settings.recents = settings.recents.map(r => resolve(r)).filter(r => r !== dir && isWorkspace(r));
    if (wasOpen) {
      const next = settings.recents.find(isWorkspace);
      if (next) return openWorkspace(next);
      ws = null; settings.workspace = null; jobs.clear(); demo?.close();
    }
    saveSettings(settings);
  }
  const initial = [workspace, settings.workspace, join(homedir(), 'Documents', 'RepFlow-promo', 'videos')].find(isWorkspace);
  if (initial) openWorkspace(initial);

  // ---------- icon font: keep the Material Symbols subset in sync with every icon in use ----------
  let iconsBusy = null;
  async function ensureIcons() {
    const names = new Set(['lock']);
    for (const b of ws.brands()) (b.pills || []).forEach(([icon]) => icon && names.add(icon));
    for (const v of ws.specs()) (v.chips || []).forEach(c => c.icon && names.add(c.icon));
    const list = [...names].filter(n => /^[a-z0-9_]+$/.test(n));
    const stamp = join(ws.p.fonts, 'icons.json');
    const have = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : [];
    if (list.every(n => have.includes(n))) return;
    const merged = [...new Set([...have, ...list])].sort();
    const fontDir = ws.p.fonts;
    iconsBusy ??= (async () => {
      const url = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:wght@600&icon_names=${merged.join(',')}&display=block`;
      const css = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' } })).text();
      const fontUrl = /url\((https:[^)]+)\)/.exec(css)?.[1];
      if (!fontUrl) throw new Error('icon font: geen url in ' + css.slice(0, 200));
      writeFileSync(join(fontDir, 'material-symbols.woff2'), Buffer.from(await (await fetch(fontUrl)).arrayBuffer()));
      writeFileSync(join(fontDir, 'icons.json'), JSON.stringify(merged));
    })().finally(() => { iconsBusy = null; });
    await iconsBusy;
  }

  // ---------- jobs ----------
  function startJob(kind, id, work) {
    const key = `${kind}:${id}`;
    if (jobs.get(key)?.state === 'running') return jobs.get(key);
    // span: the part of the bar the current step fills (a batch or a multi-format render runs several steps).
    // step: what runs now, for the progress dialog. Stopping kills the running tools (the whole tree on Windows,
    // where npx runs in a shell).
    const job = { kind, id, state: 'running', log: [], progress: 0, span: [0, 100], step: null, started: Date.now() };
    const procs = new Set();
    Object.defineProperties(job, {
      track: { value: p => { procs.add(p); p.on('close', () => procs.delete(p)); } },
      cancel: { value: () => {
        job.cancelled = true;
        for (const p of procs) {
          if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
          else p.kill('SIGTERM');
        }
      } }
    });
    jobs.set(key, job);
    const log = raw => {
      const line = String(raw).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
      if (!line || /^\[INFO\] \[Render:trace\]|^\[initSession|^\[INFO\] Calibration|^[|o]$/.test(line)) return;
      job.log.push(line); if (job.log.length > 400) job.log.shift();
      const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line); if (m) job.progress = Math.min(100, job.span[0] + (job.span[1] - job.span[0]) * Math.min(100, +m[1]) / 100);
    };
    work(log, job).then(result => { job.state = job.cancelled ? 'cancelled' : 'done'; if (!job.cancelled) job.progress = 100; job.result = result; })
      .catch(err => { job.state = job.cancelled ? 'cancelled' : 'error'; log(job.cancelled ? 'Gestopt.' : String(err.message || err)); })
      .finally(() => { job.finished = Date.now(); });
    return job;
  }

  // Renders every format the video is set to, one after another, within `span` of the job's progress bar.
  async function renderVideo(id, log, job, span = [0, 100]) {
    const w = ws, v = w.readSpec(id), { hf } = tools(settings);
    await ensureIcons().catch(e => log(`Icoon-font niet bijgewerkt: ${e.message}`));
    const downloads = join(homedir(), 'Downloads');
    const toDownloads = settings.copyToDownloads && existsSync(downloads);
    const fmts = w.formatsOf(v), files = [], outputs = [];
    for (const [k, f] of fmts.entries()) {
      if (job) {
        job.span = [span[0] + (span[1] - span[0]) * k / fmts.length, span[0] + (span[1] - span[0]) * (k + 1) / fmts.length];
        job.step = { ...job.step, i: k, n: fmts.length, format: f };
      }
      const dir = w.writeProject(v, f);
      let name = w.renderName(v, f), out = join(w.p.renders, name);
      // Windows cannot replace a file another program has open (a player, the preview): the finished render would
      // fail at the very end. Moving it away and back tells whether it is free; if not, render under a free name.
      if (existsSync(out)) {
        try { renameSync(out, `${out}.check`); renameSync(`${out}.check`, out); }
        catch {
          const base = name.replace(/\.mp4$/, '');
          let n = 2; while (existsSync(join(w.p.renders, `${base}-${n}.mp4`))) n++;
          log(`${name} is nog open in een ander programma, dus die kan niet overschreven worden. Deze render wordt ${base}-${n}.mp4.`);
          name = `${base}-${n}.mp4`; out = join(w.p.renders, name);
        }
      }
      log(`Renderen naar ${name} (${f})…`);
      // A stopped render can leave half a file behind: remove it, but never an earlier finished render.
      try { await run('npx', ['--yes', hf, 'render', dir, '-o', `../renders/${name}`], { cwd: w.p.projects }, log, job?.track); }
      catch (e) { if (job?.cancelled && existsSync(out) && statSync(out).mtimeMs >= job.started) rmSync(out, { force: true }); throw e; }
      if (toDownloads) { copyFileSync(out, join(downloads, name)); log(`Gekopieerd naar Downloads\\${name}`); }
      files.push(name);
      outputs.push({ file: name, format: f, w: formats[f].w, h: formats[f].h, size: statSync(out).size });
    }
    // Subtitle sidecar for platforms that take an uploaded .srt (YouTube, LinkedIn, TikTok ads); the same for every format.
    const srtName = w.renderName(v).replace(/\.mp4$/, '.srt');
    const srt = v.subs?.length ? toSrt(v.subs, v.end ?? 12.6) : '';
    if (srt) {
      writeFileSync(join(w.p.renders, srtName), srt, 'utf8'); log(`Ondertitels: ${srtName}`);
      if (toDownloads) copyFileSync(join(w.p.renders, srtName), join(downloads, srtName));
    }
    return { file: files[0], files, outputs, srt: srt ? srtName : null, dur: v.dur ?? 15 };
  }
  // Whether a clip file has a sound track (ffprobe), remembered per file version. Clips uploaded before sound was kept
  // have none.
  const audioMemo = new Map();
  function hasAudio(name) {
    const file = join(ws.p.clips, basename(name));
    if (!existsSync(file) || IMAGE_EXT.includes(extname(file).toLowerCase())) return false;
    const st = statSync(file), key = `${file}|${st.size}|${st.mtimeMs}`;
    if (!audioMemo.has(key)) {
      const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true });
      audioMemo.set(key, /audio/.test(r.stdout || ''));
    }
    return audioMemo.get(key);
  }
  // Silent stretches of a clip's sound, in source seconds (ffmpeg silencedetect), cached per file version and level.
  async function silencesOf(name, level) {
    const file = join(ws.p.clips, basename(name));
    if (!hasAudio(name)) throw new Error('Deze clip heeft geen geluid.');
    const db = (silenceLevels[level] || silenceLevels.normal).db, st = statSync(file);
    const dir = join(ws.p.voCache, 'silence'), cache = join(dir, `${basename(name)}.${st.size}-${Math.round(st.mtimeMs)}.${db}.json`);
    if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
    const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `silencedetect=noise=${db}dB:d=0.25`, '-f', 'null', '-']);
    const total = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
    const dur = total ? +total[1] * 3600 + +total[2] * 60 + +total[3] : Infinity;
    const result = { dur: Number.isFinite(dur) ? +dur.toFixed(3) : null, silences: parseSilences(out, dur) };
    mkdirSync(dir, { recursive: true });
    writeFileSync(cache, JSON.stringify(result));
    return result;
  }
  // The sound of the clips that have `sound: true`, laid out in video time as one 16 kHz wav (for when a video has no
  // voice/audio track, like a talking-head recording). Returns a short hash of what went in, for the cache.
  async function clipSoundWav(v, out, log, job) {
    const list = [...(v.clips || []), ...(v.layout === 'dual' ? v.clips2 || [] : [])].filter(c => c.sound && hasAudio(c.src));
    const tempo = r => { const f = []; while (r > 2) { f.push('atempo=2'); r /= 2; } while (r < 0.5) { f.push('atempo=0.5'); r /= 0.5; } f.push(`atempo=${+r.toFixed(4)}`); return f.join(','); };
    const chains = list.map((c, i) => { const rate = c.rate || 1, m = c.media || 0; return `[${i}:a]atrim=start=${m}:end=${m + c.dur * rate},asetpts=PTS-STARTPTS${rate !== 1 ? ',' + tempo(rate) : ''},aresample=16000,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`; }).join(';');
    const graph = `${chains};${list.map((_, i) => `[a${i}]`).join('')}amix=inputs=${list.length}:normalize=0:dropout_transition=0[o]`;
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...list.flatMap(c => ['-i', join(ws.p.clips, basename(c.src))]), '-filter_complex', graph, '-map', '[o]', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out], {}, log, job?.track);
    return createHash('sha1').update(graph + list.map(c => statSync(join(ws.p.clips, basename(c.src))).mtimeMs).join()).digest('hex').slice(0, 10);
  }
  // Captions from speech: whisper.cpp reads the video's voice/audio track (assets/vo) and gives every word its time.
  // The result is cached per file version, model and language. The editor puts the blocks in the spec (so undo works).
  async function transcribe(id, log, job) {
    const w = ws, v = w.readSpec(id), st = whisperStatus(settings);
    const fromClips = !v.audio;
    if (fromClips && ![...(v.clips || []), ...(v.clips2 || [])].some(c => c.sound && hasAudio(c.src))) throw new Error('Deze video heeft geen stem- of audiospoor, en geen clip met geluid, om af te luisteren.');
    if (!st.cli || !st.model) throw Object.assign(new Error('Whisper is nog niet geïnstalleerd.'), { code: 'whisper_missing' });
    const file = fromClips ? null : join(w.p.vo, basename(v.audio));
    if (file && !existsSync(file)) throw new Error(`Audiobestand niet gevonden: ${v.audio}`);
    // Whisper detects the language itself: the brand's language says what the video's texts are in, not what is spoken.
    const lang = 'auto';
    const dir = join(w.p.voCache, 'whisper');
    const tmp = join(tmpdir(), `ms-whisper-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    let json, segs = null;
    try {
      let wav = join(tmp, 'in.wav'), key;
      if (fromClips) { log('Geluid van de clips samenvoegen…'); key = `clips-${id}-${await clipSoundWav(v, wav, log, job)}`; }
      else key = `${basename(v.audio)}.${cacheKey(file, basename(st.model), lang)}`;
      const cache = join(dir, `${key}.${basename(st.model)}.v2.json`);
      if (existsSync(cache)) { log('Uit cache.'); ({ json, segs } = JSON.parse(readFileSync(cache, 'utf8'))); }
      else {
        if (!fromClips) { log('Audio omzetten (16 kHz)…'); await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], {}, log, job?.track); }
        // Long silences go first: recognition stretches the first word after one over it. Times are mapped back below.
        const total = wavSeconds(wav);
        const quiet = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'silencedetect=noise=-35dB:d=0.6', '-f', 'null', '-'], {}, null, job?.track);
        const keep = speechSegments(parseSilences(quiet, total), total);
        if (!keep.length) throw new Error('Er is geen spraak herkend in dit audiobestand.');
        if (keep.length > 1 || keep[0][0] > 0.01 || keep[0][1] < total - 0.01) {
          const trimmed = join(tmp, 'speech.wav');
          await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', `aselect='${keep.map(([a, b]) => `between(t,${a},${b})`).join('+')}',asetpts=N/SR/TB`, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', trimmed], {}, log, job?.track);
          wav = trimmed; segs = keep;
          log(`${(total - keep.reduce((n, [a, b]) => n + b - a, 0)).toFixed(1)}s stilte overgeslagen.`);
        }
        log('Woorden herkennen…');
        json = await whisperJson({ cli: st.cli, model: st.model, wav, lang, outBase: join(tmp, 'out'), run, onLine: log, onSpawn: job?.track });
        mkdirSync(dir, { recursive: true });
        writeFileSync(cache, JSON.stringify({ json, segs }));
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const words = wordsFromWhisper(json).map(w => (segs ? { ...w, t: mapFromSegments(segs, w.t), e: Math.max(mapFromSegments(segs, w.t) + 0.05, mapFromSegments(segs, w.e)) } : w));
    if (!words.length) throw new Error('Er is geen spraak herkend in dit audiobestand.');
    return { subs: subsFromWords(words), words: words.length, lang: json.result?.language || lang };
  }
  // Beats of a music file (source time), detected once by `hyperframes beats` in a scratch project and cached
  // next to the TTS cache, keyed by size + mtime so a replaced file is analysed again.
  const beatJobs = new Map();
  function beatsOf(name) {
    const w = ws, file = join(w.p.vo, basename(name));
    if (!existsSync(file)) throw new Error('Bestand niet gevonden.');
    const st = statSync(file), dir = join(w.p.voCache, 'beats');
    const cache = join(dir, `${basename(name)}.${st.size}-${Math.round(st.mtimeMs)}.json`);
    if (existsSync(cache)) return Promise.resolve(JSON.parse(readFileSync(cache, 'utf8')));
    if (beatJobs.has(cache)) return beatJobs.get(cache);
    const job = (async () => {
      const tmp = join(tmpdir(), `ms-beats-${Date.now()}`), ext = extname(file);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      try {
        copyFileSync(file, join(tmp, 'assets', `music${ext}`));
        const dur = ext.toLowerCase() === '.wav' ? Math.ceil(wavSeconds(file)) || 600 : 600;
        writeFileSync(join(tmp, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root" data-composition-id="beats" data-start="0" data-width="1080" data-height="1920" data-duration="${dur}" data-fps="30"><audio id="music" src="assets/music${ext}" data-start="0" data-duration="${dur}" data-track-index="41"></audio></div></body></html>`);
        await run('npx', ['--yes', tools(settings).hf, 'beats', '.', '--json'], { cwd: tmp });
        const found = JSON.parse(readFileSync(join(tmp, 'beats', 'assets', `music${ext}.json`), 'utf8')).beats || [];
        const gaps = found.slice(1).map((b, i) => b.time - found[i].time).sort((a, b) => a - b);
        const bpm = gaps.length ? Math.round(60 / gaps[gaps.length >> 1]) : null;
        const result = { bpm, beats: found.map(b => ({ t: +b.time.toFixed(3), s: +(b.strength ?? 1).toFixed(2) })) };
        mkdirSync(dir, { recursive: true });
        writeFileSync(cache, JSON.stringify(result));
        return result;
      } finally { rmSync(tmp, { recursive: true, force: true }); beatJobs.delete(cache); }
    })();
    beatJobs.set(cache, job);
    return job;
  }
  // Filmstrip of a clip for the timeline: frames `step` seconds apart in one JPEG row, made once per file version
  // (keyed by size + mtime) in <workspace>/.cache/thumbs.
  const thumbJobs = new Map();
  function thumbsOf(name) {
    const file = join(ws.p.clips, basename(name));
    if (!existsSync(file) || IMAGE_EXT.includes(extname(file).toLowerCase())) return Promise.reject(new Error('Geen videoclip.'));
    const st = statSync(file);
    const key = `${slug(name)}-${createHash('sha1').update(`${name}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 10)}`;
    const dir = join(ws.root, '.cache', 'thumbs'), meta = join(dir, `${key}.json`);
    if (existsSync(meta)) return Promise.resolve(JSON.parse(readFileSync(meta, 'utf8')));
    if (!thumbJobs.has(key)) thumbJobs.set(key, (async () => {
      mkdirSync(dir, { recursive: true });
      const dur = +(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim();
      if (!(dur > 0)) throw new Error('Onbekende clipduur.');
      const step = Math.max(0.25, dur / 120), n = Math.max(1, Math.ceil(dur / step));
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-an', '-vf', `fps=${(1 / step).toFixed(5)},scale=-2:96,tile=${n}x1`, '-frames:v', '1', '-q:v', '5', join(dir, `${key}.jpg`)]);
      const info = { src: `/thumbs/${key}.jpg`, n, step, dur };
      writeFileSync(meta, JSON.stringify(info));
      return info;
    })().finally(() => thumbJobs.delete(key)));
    return thumbJobs.get(key);
  }

  async function renderBatch(ids, log, job) {
    const results = [];
    for (const [i, id] of ids.entries()) {
      if (job.cancelled) break;
      job.step = { video: id, vi: i, vn: ids.length };
      log(`▶ ${id} (${i + 1}/${ids.length})`);
      try { results.push({ id, ...(await renderVideo(id, log, job, [100 * i / ids.length, 100 * (i + 1) / ids.length])) }); }
      catch (e) { log(`✗ ${id}: ${e.message || e}`); results.push({ id, error: String(e.message || e) }); }
    }
    return { results };
  }

  async function voiceOver(id, log) {
    const w = ws, v = w.readSpec(id), t = tools(settings);
    const brand = w.brandFor(v);
    const lines = (v.vo?.lines || []).filter(l => l.text?.trim());
    if (!lines.length) throw new Error('Geen voice-over zinnen. Voeg zinnen toe op de Voice-over track.');
    const voice = v.vo?.voice || (brand.lang === 'nl' ? 'nl_NL-pim-medium' : 'am_michael');
    const piper = PIPER.includes(voice);
    const speed = +v.vo?.speed || (piper ? 1 : 1.08);
    if (piper && !existsSync(join(t.piperVoices, `${voice}.onnx`))) throw new Error(`Piper-stem ${voice} niet gevonden. Stel de map met stemmen in bij Instellingen.`);
    if (!t.python || !existsSync(t.python)) throw new Error('Geen Python voor TTS gevonden. Stel het pad in bij Instellingen.');
    const dir = join(w.p.voCache, id);
    mkdirSync(dir, { recursive: true });
    const env = { ...process.env, HYPERFRAMES_PYTHON: t.python, PYTHONIOENCODING: 'utf-8' };
    for (const [i, l] of lines.entries()) {
      const hash = createHash('sha1').update(`${voice}|${speed}|${l.text}`).digest('hex').slice(0, 12);
      l.file = join(dir, `${hash}.wav`);
      if (!existsSync(l.file)) {
        log(`Zin ${i + 1}/${lines.length}: "${l.text}"`);
        const txt = join(tmpdir(), `ms-vo-${hash}.txt`);
        writeFileSync(txt, l.text, 'utf8');
        try {
          if (piper) await run(t.python, ['-m', 'piper', '-m', join(t.piperVoices, `${voice}.onnx`), '-i', txt, '-f', l.file, '--length-scale', String(+(1 / speed).toFixed(3))], { env }, log);
          else await run('npx', ['--yes', t.hf, 'tts', txt, '-v', voice, '-s', String(speed), '-o', l.file], { env, cwd: w.root }, log);
        } finally { rmSync(txt, { force: true }); }
      } else log(`Zin ${i + 1}/${lines.length}: uit cache`);
      l.len = +wavSeconds(l.file).toFixed(2);
      log(`${Math.round((i + 1) / (lines.length + 1) * 100)}%`);
    }
    const dur = v.dur ?? 15;
    const out = join(w.p.vo, `${id}.wav`);
    const chains = lines.map((l, i) => `[${i}:a]aresample=48000,adelay=${Math.round(l.t * 1000)}:all=1[a${i}]`).join(';');
    const mix = `${chains};${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,apad,atrim=0:${dur},loudnorm=I=-14:TP=-1.5:LRA=11[out]`;
    log('Mixen met ffmpeg…');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...lines.flatMap(l => ['-i', l.file]), '-filter_complex', mix, '-map', '[out]', '-ar', '48000', '-ac', '2', out], {}, log);
    const fresh = w.readSpec(id);
    // file + at: where each line sits in the mix, so a line moved later takes its own audio along (voiceSegments).
    fresh.vo = { ...(fresh.vo || {}), voice, speed, file: `${id}.wav` };
    fresh.vo.lines = (fresh.vo.lines || []).map(l => { const m = lines.find(x => x.t === l.t && x.text === l.text); return m ? { ...l, len: m.len, at: m.t } : l; });
    fresh.audio = `${id}.wav`;
    w.writeSpec(id, fresh);
    return { audio: fresh.audio, lines: fresh.vo.lines };
  }

  // Uploads: videos → H.264 mp4 (plays in Chrome, incl. iPhone HEVC/MOV), audio → wav, images and fonts as-is.
  async function importMedia(name, buf, kind) {
    const ext = extname(name).toLowerCase();
    const base = slug(name);
    if (kind === 'logo') {
      if (!['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Logo moet svg, png, jpg of webp zijn.');
      writeFileSync(join(ws.p.brandAssets, base + ext), buf);
      return { kind: 'logo', name: base + ext };
    }
    if (['.woff2', '.woff', '.ttf', '.otf'].includes(ext)) { writeFileSync(join(ws.p.fonts, base + ext), buf); return { kind: 'font', name: base + ext }; }
    if (IMAGE_EXT.includes(ext)) { writeFileSync(join(ws.p.clips, base + ext), buf); return { kind: 'clip', name: base + ext }; }
    const tmp = join(tmpdir(), `ms-upload-${Date.now()}${ext}`);
    writeFileSync(tmp, buf);
    try {
      if (['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac'].includes(ext)) {
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-ar', '48000', '-ac', '2', join(ws.p.vo, `${base}.wav`)]);
        return { kind: 'audio', name: `${base}.wav` };
      }
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'veryfast', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', join(ws.p.clips, `${base}.mp4`)]);
      return { kind: 'clip', name: `${base}.mp4` };
    } finally { rmSync(tmp, { force: true }); }
  }

  const previewHtml = (v, fmt) => ws.html(v, fmt)
    .replace('<script src="gsap.min.js">', '<script>window.__timelines = {};</script>\n    <script src="gsap.min.js">')
    .replace('</body>', '  <script src="/ui/player.js"></script>\n  </body>');

  function state() {
    const t = tools(settings);
    const base = { canTrash: !!trash, settings: { ...settings, detected: t }, whisper: { ...whisperStatus(settings), models: whisperModels }, layouts: Object.fromEntries(Object.entries(layouts).map(([k, l]) => [k, l.label])), screens: Object.fromEntries(Object.entries(layouts).map(([k, l]) => [k, l.screen])), insets: Object.fromEntries(Object.entries(layouts).map(([k, l]) => [k, l.inset])), devs: Object.fromEntries(Object.entries(layouts).map(([k, l]) => [k, l.dev])), formats, transitions, defaultTheme, defaultChipColors };
    if (!ws) return { ...base, workspace: null };
    return {
      ...base,
      workspace: { path: ws.root, ...ws.config },
      videos: ws.specs().map(v => ({ id: v.id, media: mediaOf(v), overline: v.overline, brand: v.brand || null, dur: v.dur ?? 15, formats: ws.formatsOf(v) })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
      clips: ws.files(ws.p.clips, ['.mp4', '.webm', ...IMAGE_EXT]),
      clipAudio: Object.fromEntries(ws.files(ws.p.clips, ['.mp4', '.webm']).map(f => [f, hasAudio(f)])),
      silenceLevels,
      audio: ws.files(ws.p.vo, ['.wav', '.mp3']),
      fonts: ws.files(ws.p.fonts, ['.woff2', '.woff', '.ttf', '.otf']).filter(f => !f.startsWith('material-symbols')),
      logos: ws.files(ws.p.brandAssets, ['.svg', '.png', '.jpg', '.jpeg', '.webp']),
      brands: ws.brands(),
      tts: { piper: PIPER.filter(p => t.piperVoices && existsSync(join(t.piperVoices, `${p}.onnx`))), python: !!(t.python && existsSync(t.python)) }
    };
  }

  // ---------- routes ----------
  demo = createDemoManager({ getWorkspace: () => ws, getSettings: () => settings, run });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      const method = req.method;
      let m;

      // The editor page carries its interface language (setting, else the browser/OS language), so it paints translated.
      if (p === '/' || p === '/index.html') {
        const want = ['nl', 'en'].includes(settings.uiLang) ? settings.uiLang : /^nl\b/i.test(req.headers['accept-language'] || '') ? 'nl' : 'en';
        return send(res, 200, readFileSync(join(UI, 'index.html'), 'utf8').replace('<html lang="nl">', `<html lang="${want}" data-ui-lang="${want}">`), MIME['.html']);
      }
      if ((m = /^\/ui\/([\w.-]+)$/.exec(p))) return sendFile(req, res, join(UI, m[1]));
      if ((m = /^\/lib\/(captions|audio|starters|keyframes|edit|silence|gestures|demo|headfx|backgrounds|template)\.mjs$/.exec(p))) return sendFile(req, res, join(APP_ROOT, 'src', `${m[1]}.mjs`));

      if (p.startsWith('/api/demo') && !ws) return send(res, 400, { error: 'Open eerst een project.' });
      if (await demo.route(p, method, req, res, { readJsonBody, send, url })) return;
      if (p === '/api/state' && method === 'GET') return send(res, 200, state());
      if (p === '/api/settings' && method === 'PUT') { settings = saveSettings({ ...settings, ...(await readJsonBody(req)) }); return send(res, 200, state()); }
      if (p === '/api/workspace/open' && method === 'POST') {
        const { path } = await readJsonBody(req);
        if (!isWorkspace(path)) return send(res, 400, { error: 'Deze map is geen Motion Studio-project (studio.json ontbreekt). Kies "Nieuw project" om er een te maken.' });
        openWorkspace(path); return send(res, 200, state());
      }
      if (p === '/api/workspace/remove' && method === 'POST') {
        const { path, trash: toTrash } = await readJsonBody(req);
        const dir = resolve(String(path || ''));
        if (!settings.recents.some(r => resolve(r) === dir)) return send(res, 400, { error: 'Dit project staat niet in de lijst.' });
        if (toTrash) {
          if (!trash) return send(res, 400, { error: 'Naar de prullenbak kan alleen in de app. Haal het project uit de lijst en verwijder de map zelf.' });
          // Only a real project folder, never the home folder or a drive: studio.json must be in it.
          if (!isWorkspace(dir) || dir === resolve(homedir()) || dir.split(/[\\/]/).filter(Boolean).length < 2) return send(res, 400, { error: 'Deze map wordt niet verwijderd: het is geen los projectmap.' });
          try { await trash(dir); } catch (e) { return send(res, 500, { error: `Kon de map niet naar de prullenbak verplaatsen: ${e.message}` }); }
        }
        forgetWorkspace(dir);
        return send(res, 200, state());
      }
      if (p === '/api/workspace/create' && method === 'POST') {
        const { path, name } = await readJsonBody(req);
        createWorkspace(path, name); openWorkspace(path); return send(res, 200, state());
      }
      if (p === '/api/workspace' && method === 'PUT') { ws.config = { ...ws.config, ...(await readJsonBody(req)) }; return send(res, 200, state()); }
      if (p === '/api/workspace/reveal' && method === 'POST') {
        const { what } = await readJsonBody(req);
        const target = { renders: ws.p.renders, clips: ws.p.clips, root: ws.root }[what] || ws.root;
        spawn('explorer', [target], { detached: true, stdio: 'ignore' }).unref();
        return send(res, 200, { ok: true });
      }

      if (!ws) return send(res, 409, { error: 'Geen project geopend.' });

      // Preview = the real template + a seekable player. Assets come straight from the workspace.
      if ((m = /^\/preview\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(p))) {
        if (!ws.hasSpec(m[1])) return send(res, 404, 'unknown video', 'text/plain');
        ensureIcons().catch(e => console.warn('icons:', e.message));
        return send(res, 200, previewHtml(ws.readSpec(m[1]), url.searchParams.get('f')), MIME['.html']);
      }
      if (/^\/preview\/[a-z0-9-]+\/gsap\.min\.js$/.test(p)) return sendFile(req, res, GSAP_FILE);
      if ((m = /^\/(?:preview\/[a-z0-9-]+\/)?assets\/(.+)$/.exec(p))) {
        const file = join(ws.p.assets, m[1]);
        return inside(ws.p.assets, file) ? sendFile(req, res, file) : send(res, 403, 'no');
      }
      if ((m = /^\/renders\/([^/]+)$/.exec(p))) return sendFile(req, res, join(ws.p.renders, basename(m[1])));
      if ((m = /^\/thumbs\/([^/]+\.jpg)$/.exec(p))) return sendFile(req, res, join(ws.root, '.cache', 'thumbs', basename(m[1])));
      if ((m = /^\/api\/thumbs\/([^/]+)$/.exec(p))) return send(res, 200, await thumbsOf(m[1]));

      if ((m = /^\/api\/videos\/([a-z0-9-]+)$/.exec(p))) {
        const id = m[1];
        if (method === 'GET') return ws.hasSpec(id) ? send(res, 200, ws.readSpec(id)) : send(res, 404, { error: 'not found' });
        // POST too: navigator.sendBeacon (the last save when the page closes) can only post.
        if (method === 'PUT' || method === 'POST') { ws.writeSpec(id, await readJsonBody(req)); return send(res, 200, { ok: true }); }
        if (method === 'DELETE') { ws.trashSpec(id); return send(res, 200, { ok: true }); }
      }
      if (p === '/api/videos' && method === 'POST') {
        const { id, spec } = await readJsonBody(req);
        if (!validId(id)) return send(res, 400, { error: 'Gebruik alleen kleine letters, cijfers en streepjes.' });
        if (ws.hasSpec(id)) return send(res, 409, { error: `"${id}" bestaat al.` });
        const v = normalize({ ...spec, id });
        delete v.audio; delete v.dual;
        if (v.vo) { delete v.vo.file; v.vo.lines = (v.vo.lines || []).map(({ len, at, ...l }) => l); }
        ws.writeSpec(id, v);
        return send(res, 200, v);
      }

      if ((m = /^\/api\/brands\/([a-z0-9-]+)$/.exec(p))) {
        const id = m[1];
        if (method === 'PUT' || method === 'POST') { ws.writeBrand(id, await readJsonBody(req)); return send(res, 200, { ok: true }); }
      }
      if (p === '/api/brands' && method === 'POST') {
        const { id, from, name } = await readJsonBody(req);
        if (!validId(id)) return send(res, 400, { error: 'Id: gebruik alleen kleine letters, cijfers en streepjes.' });
        if (ws.brandIds().includes(id)) return send(res, 409, { error: `Merk "${id}" bestaat al.` });
        const base = from && ws.brandIds().includes(from) ? ws.readBrand(from) : { lang: 'en', url: '', theme: {}, pills: [['bolt', 'Free']] };
        ws.writeBrand(id, { ...base, name: name || (from ? `${base.name} (kopie)` : id), renderPrefix: undefined });
        return send(res, 200, state());
      }

      // Assets: GET …/usage lists who uses a file; DELETE moves it to <folder>/.trash and unlinks it everywhere
      // (clips leave the videos, audio tracks are dropped, brands fall back to no logo / the default font).
      if ((m = /^\/api\/assets\/(clips|vo|brand|fonts)\/([^/]+?)(\/usage)?$/.exec(p))) {
        const [, kind, raw, usage] = m;
        const name = basename(raw);
        const dir = { clips: ws.p.clips, vo: ws.p.vo, brand: ws.p.brandAssets, fonts: ws.p.fonts }[kind];
        const file = join(dir, name);
        if (!existsSync(file)) return send(res, 404, { error: 'Bestand niet gevonden.' });
        if (kind === 'fonts' && ['google-sans-flex-latin.woff2', 'material-symbols.woff2'].includes(name)) return send(res, 400, { error: 'Dit lettertype hoort bij Motion Studio zelf en kan niet weg.' });
        const unlinkVideo = v => {
          let hit = false;
          if (v.media?.includes(name)) { v.media = v.media.filter(n => n !== name); hit = true; }
          if (kind === 'clips') for (const k of ['clips', 'clips2']) { const n = (v[k] || []).length; v[k] = (v[k] || []).filter(c => c.src !== name); hit ||= v[k].length !== n; }
          if (kind === 'vo') {
            if (v.audio === name) { delete v.audio; delete v.audioVol; hit = true; }
            if (v.music?.src === name) { delete v.music; hit = true; }
          }
          return hit;
        };
        const unlinkBrand = b => {
          if (kind === 'brand' && b.logo === name) { delete b.logo; return true; }
          if (kind === 'fonts' && b.font === name) { delete b.font; return true; }
          return false;
        };
        const videos = ws.specs().filter(v => unlinkVideo(clone(v))).map(v => v.id);
        const brands = ws.brands().filter(b => unlinkBrand({ ...b })).map(b => b.name);
        if (usage && method === 'GET') return send(res, 200, { videos, brands });
        if (usage || method !== 'DELETE') return send(res, 405, { error: 'method' });
        const trash = join(dir, '.trash');
        mkdirSync(trash, { recursive: true });
        renameSync(file, join(trash, `${Date.now()}-${name}`));
        for (const v of ws.specs()) if (unlinkVideo(v)) ws.writeSpec(v.id, v);
        for (const b of ws.brands()) if (unlinkBrand(b)) ws.writeBrand(b.id, b);
        return send(res, 200, { ...state(), changed: videos, brands });
      }

      if (p === '/api/upload' && method === 'POST') return send(res, 200, await importMedia(url.searchParams.get('name') || 'file.mp4', await readBody(req), url.searchParams.get('kind')));

      if ((m = /^\/api\/silences\/([^/]+)$/.exec(p))) return send(res, 200, await silencesOf(decodeURIComponent(m[1]), url.searchParams.get('level')));
      if ((m = /^\/api\/beats\/([^/]+)$/.exec(p))) return send(res, 200, await beatsOf(m[1]));
      if (p === '/api/batch/all') {
        if (method === 'POST') {
          const ids = ((await readJsonBody(req)).ids || []).filter(id => ws.hasSpec(id));
          if (!ids.length) return send(res, 400, { error: 'Kies minstens één video.' });
          return send(res, 200, startJob('batch', 'all', (log, job) => renderBatch(ids, log, job)));
        }
        if (method === 'DELETE') jobs.get('batch:all')?.cancel();
        return send(res, 200, jobs.get('batch:all') || { state: 'idle' });
      }
      if (p === '/api/whisper/install') {
        if (method === 'POST') {
          const model = (await readJsonBody(req)).model;
          return send(res, 200, startJob('whisper', 'install', log => installWhisper(settings, whisperModels[model] ? model : defaultWhisperModel, log)));
        }
        if (method === 'DELETE') jobs.get('whisper:install')?.cancel();
        return send(res, 200, jobs.get('whisper:install') || { state: 'idle' });
      }
      if ((m = /^\/api\/(render|vo|transcribe)\/([a-z0-9-]+)$/.exec(p))) {
        const [, kind, id] = m;
        if (method === 'POST') {
          if (!ws.hasSpec(id)) return send(res, 404, { error: 'not found' });
          return send(res, 200, startJob(kind, id, kind === 'render' ? (log, job) => renderVideo(id, log, job) : kind === 'transcribe' ? (log, job) => transcribe(id, log, job) : log => voiceOver(id, log)));
        }
        if (method === 'DELETE') jobs.get(`${kind}:${id}`)?.cancel();
        return send(res, 200, jobs.get(`${kind}:${id}`) || { state: 'idle' });
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      console.error(err);
      send(res, 500, { error: String(err.message || err) });
    }
  });

  server.once('close', () => demo.shutdown());

  // `port` may be a list: the first free one wins (0 = any free port).
  const listen = p => new Promise((ok, fail) => { server.once('error', fail); server.listen(p, host, () => { server.off('error', fail); ok(); }); });
  const tries = [].concat(port);
  for (const [i, p] of tries.entries()) {
    try { await listen(p); break; } catch (e) { if (e.code !== 'EADDRINUSE' || i === tries.length - 1) throw e; }
  }
  return { server, port: server.address().port, url: `http://${host}:${server.address().port}` };
}

// Standalone: node src/server.mjs [--port N] [--workspace DIR]
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { url } = await startServer({ port: +(arg('--port') || process.env.PORT || 3400), workspace: arg('--workspace') });
  console.log(`Motion Studio → ${url}`);
}
