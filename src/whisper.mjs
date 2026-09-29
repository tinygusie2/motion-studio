// Speech recognition with whisper.cpp: finding it, installing it (once, on the user's request) and running it.
// Nothing here touches the network unless installWhisper() is called.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir, cpus } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// A pinned release: the "latest" tag of whisper.cpp has no binaries attached.
export const WHISPER_VERSION = 'v1.9.2';
export const WHISPER_ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;
// Models from the whisper.cpp repository on Hugging Face. English-only models are left out: the app is used in Dutch too.
export const whisperModels = {
  base: { file: 'ggml-base.bin', mb: 148, label: 'Snel (base)' },
  small: { file: 'ggml-small.bin', mb: 488, label: 'Nauwkeurig (small)' }
};
export const modelUrl = name => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${whisperModels[name].file}`;
export const defaultWhisperModel = 'small';

export const whisperDir = () => join(homedir(), '.motion-studio', 'whisper');
const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';

function findFile(dir, name) {
  if (!existsSync(dir)) return '';
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.toLowerCase() === name) return join(dir, e.name);
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const f = findFile(join(dir, e.name), name); if (f) return f; }
  }
  return '';
}
function onPath(name) {
  try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim(); } catch { return ''; }
}

// Where whisper-cli and a model are: the paths from Settings first, then what the app installed itself, then PATH.
export function whisperStatus(settings = {}) {
  const dir = whisperDir();
  const cli = [settings.whisperCli, findFile(join(dir, 'bin'), exe), onPath('whisper-cli')].find(p => p && existsSync(p)) || '';
  const want = whisperModels[settings.whisperModel] ? settings.whisperModel : defaultWhisperModel;
  const models = ['small', 'base'].filter(m => whisperModels[m]);
  const installed = [want, ...models.filter(m => m !== want)].find(m => existsSync(join(dir, 'models', whisperModels[m].file)));
  const model = [settings.whisperModelFile, installed && join(dir, 'models', whisperModels[installed].file)].find(p => p && existsSync(p)) || '';
  return { cli, model, modelName: installed || null, want, canInstall: process.platform === 'win32' && process.arch === 'x64' };
}

// Downloads `url` to `dest` (through a .part file), reporting 0..100. `sha256` (hex) is checked when given.
async function download(url, dest, { onProgress, sha256 } = {}) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Downloaden mislukt (${res.status}): ${url}`);
  const total = +res.headers.get('content-length') || 0;
  let got = 0, last = -1;
  const part = `${dest}.part`;
  mkdirSync(join(dest, '..'), { recursive: true });
  const body = Readable.fromWeb(res.body);
  body.on('data', c => { got += c.length; const pct = total ? Math.floor(got / total * 100) : 0; if (pct !== last) { last = pct; onProgress?.(pct); } });
  await pipeline(body, createWriteStream(part));
  if (sha256) {
    const h = createHash('sha256');
    await pipeline(createReadStream(part), h);
    if (h.digest('hex') !== sha256.toLowerCase()) { rmSync(part, { force: true }); throw new Error('De download is beschadigd (controlesom klopt niet). Probeer het opnieuw.'); }
  }
  renameSync(part, dest);
}
// The checksum Hugging Face publishes for a file, without downloading it.
async function modelSha(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    const tag = (r.headers.get('x-linked-etag') || '').replace(/"/g, '');
    return /^[0-9a-f]{64}$/i.test(tag) ? tag : undefined;
  } catch { return undefined; }
}

// Installs what is missing: whisper-cli (Windows x64 only; elsewhere the user installs it) and the chosen model.
// Progress goes to `log` as "… 42%" lines, spread over the two downloads.
export async function installWhisper(settings, model, log) {
  if (!whisperModels[model]) throw new Error(`Onbekend model: ${model}`);
  const dir = whisperDir(), st = whisperStatus(settings);
  const needBin = !st.cli, needModel = !existsSync(join(dir, 'models', whisperModels[model].file));
  if (needBin && !st.canInstall) throw new Error('Whisper is nog niet geïnstalleerd, en Motion Studio kan het alleen op Windows (x64) zelf ophalen. Installeer whisper.cpp (bijvoorbeeld "brew install whisper-cpp") en zet het pad bij Instellingen.');
  const parts = [needBin && 8, needModel && whisperModels[model].mb].filter(Boolean), sum = parts.reduce((a, b) => a + b, 0) || 1;
  let done = 0;
  const step = (weight, text) => pct => log(`${text} ${Math.round((done + weight * pct / 100) / sum * 100)}%`);
  if (needBin) {
    log('Whisper (whisper.cpp) downloaden…');
    const zip = join(dir, 'whisper-bin.zip');
    await download(WHISPER_ZIP, zip, { onProgress: step(8, 'Whisper downloaden…') });
    rmSync(join(dir, 'bin'), { recursive: true, force: true });
    mkdirSync(join(dir, 'bin'), { recursive: true });
    // bsdtar ships with Windows 10+ and reads zip files. Use that one: a GNU tar earlier on PATH (Git for Windows)
    // takes "C:" for a host name.
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', zip, '-C', join(dir, 'bin')], { windowsHide: true });
    rmSync(zip, { force: true });
    if (!findFile(join(dir, 'bin'), exe)) throw new Error('whisper-cli.exe zat niet in de download.');
    done += 8;
  }
  if (needModel) {
    log(`Model ${model} downloaden (${whisperModels[model].mb} MB)…`);
    const url = modelUrl(model);
    await download(url, join(dir, 'models', whisperModels[model].file), { onProgress: step(whisperModels[model].mb, 'Model downloaden…'), sha256: await modelSha(url) });
  }
  log('Klaar. 100%');
  return whisperStatus(settings);
}

// Runs whisper-cli on a 16 kHz mono wav and returns its JSON transcript, one word per entry. `run` is the app's
// process runner (run(cmd, args, opts, onLine, onSpawn)).
export async function whisperJson({ cli, model, wav, lang, outBase, run, onLine, onSpawn }) {
  const threads = Math.max(2, Math.min(8, Math.floor(cpus().length / 2)));
  await run(cli, ['-m', model, '-f', wav, '-l', lang || 'auto', '-ml', '1', '-sow', '-oj', '-of', outBase, '-pp', '-t', String(threads)], {}, onLine, onSpawn);
  // whisper.cpp writes UTF-8 JSON; some builds leave a stray byte-order mark.
  return JSON.parse(readFileSync(`${outBase}.json`, 'utf8').replace(/^﻿/, ''));
}
export const cacheKey = (file, model, lang) => { const s = statSync(file); return `${s.size}-${Math.round(s.mtimeMs)}.${model}.${lang}`; };
