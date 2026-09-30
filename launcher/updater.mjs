// Installs, updates and starts the editors the launcher knows, from their GitHub releases.
// Every version goes into its own folder (apps/<id>/<version>), so an update never has to touch the files of a copy
// that is still running; the previous version stays as a fallback and older ones are cleaned up.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const GITHUB_API = 'https://api.github.com';
const headers = { 'User-Agent': 'Motion-Launcher', Accept: 'application/vnd.github+json' };

// 1.10.0 > 1.9.3; a leading v and anything after the third number (-beta, +build) are ignored.
export function compareVersions(a, b) {
  const parts = v => String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// The launcher's own file: which version of each app is installed, and its settings.
export class Store {
  constructor(root) {
    this.root = root;
    this.file = join(root, 'state.json');
    let saved = {};
    try { saved = JSON.parse(readFileSync(this.file, 'utf8')); } catch {}
    this.state = { apps: saved.apps || {}, settings: { autoUpdate: true, closeOnLaunch: false, ...saved.settings } };
  }
  get settings() { return this.state.settings; }
  installed(id) { return this.state.apps[id] || null; }
  setInstalled(id, info) { this.state.apps[id] = info; this.save(); }
  setSettings(patch) { Object.assign(this.state.settings, patch); this.save(); }
  save() {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }
}

// The newest published (non-draft, non-prerelease) release of an app and the files the launcher needs from it.
export async function latestRelease(app, { api = GITHUB_API } = {}) {
  const res = await fetch(`${api}/repos/${app.repo}/releases/latest`, { headers });
  if (res.status === 404) return null; // nothing released yet
  if (!res.ok) throw new Error(`GitHub: ${res.status} ${res.statusText}`);
  const rel = await res.json();
  const pattern = new RegExp(app.asset);
  const zip = rel.assets.find(a => pattern.test(a.name));
  const sums = rel.assets.find(a => a.name === (app.checksums || 'SHA256SUMS.txt'));
  return {
    version: rel.tag_name.replace(/^v/i, ''),
    name: rel.name || rel.tag_name,
    notes: rel.body || '',
    url: rel.html_url,
    published: rel.published_at,
    zip: zip && { name: zip.name, url: zip.browser_download_url, size: zip.size },
    sums: sums && { url: sums.browser_download_url }
  };
}

// Streams url to dest while hashing it; onProgress(received, total). Returns the SHA-256 in hex.
export async function download(url, dest, onProgress = () => {}) {
  const res = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  let received = 0, last = 0;
  const meter = new Transform({
    transform(chunk, _enc, done) {
      hash.update(chunk); received += chunk.length;
      const now = Date.now();
      if (now - last > 100) { last = now; onProgress(received, total); }
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(res.body), meter, createWriteStream(dest));
  onProgress(received, total);
  return hash.digest('hex');
}

// "<sha256> *name" or "<sha256>  name" lines, as sha256sum writes them.
export function parseChecksums(text) {
  const sums = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/i);
    if (m) sums[m[2]] = m[1].toLowerCase();
  }
  return sums;
}

// Windows' own tar.exe (bsdtar) unpacks zips; Git Bash's GNU tar that may come first on PATH does not.
function extract(zip, dir) {
  const [cmd, args] = process.platform === 'win32'
    ? [join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir]]
    : ['unzip', ['-q', zip, '-d', dir]];
  return new Promise((resolve, reject) => execFile(cmd, args, { windowsHide: true }, err => err ? reject(err) : resolve()));
}

const appDir = (root, id) => join(root, 'apps', id);
export const exePath = (root, app, version) => join(appDir(root, app.id), version, app.exe);
// The exe of what is installed: a version the launcher unpacked, or a copy it found elsewhere (info.path).
export const installedExe = (root, app, info) => info.path ? join(info.path, app.exe) : exePath(root, app, info.version);

// An install the launcher did not make itself: the first of `exes` (e.g. the targets of Start menu shortcuts) with the
// app's file name. Its version comes from the packaged app's package.json; the launcher then starts that copy and
// only installs its own when there is a newer release, so nobody has to install an editor twice.
export function findExisting(app, exes) {
  for (const exe of exes) {
    if (!exe || basename(exe).toLowerCase() !== app.exe.toLowerCase() || !existsSync(exe)) continue;
    let version = '0.0.0';
    try { version = JSON.parse(readFileSync(join(dirname(exe), 'resources', 'app', 'package.json'), 'utf8')).version || version; } catch {}
    return { version, path: dirname(exe), found: true, installedAt: statSync(exe).mtime.toISOString(), verified: false, previous: null };
  }
  return null;
}

// Downloads, checks and unpacks a release, then makes it the installed version.
// onProgress({ phase: 'download' | 'verify' | 'extract', received, total }).
export async function install(app, release, { root, store, onProgress = () => {} }) {
  if (!release?.zip) throw new Error(`No download matching ${app.asset} in release ${release?.version}`);
  const dir = appDir(root, app.id);
  mkdirSync(dir, { recursive: true });
  const zipFile = join(dir, `.download-${release.version}.zip`);
  const staging = join(dir, `.staging-${release.version}`);
  try {
    const sha = await download(release.zip.url, zipFile, (received, total) => onProgress({ phase: 'download', received, total: total || release.zip.size }));

    onProgress({ phase: 'verify' });
    let verified = false;
    if (release.sums) {
      const res = await fetch(release.sums.url, { headers: { 'User-Agent': headers['User-Agent'] } });
      if (!res.ok) throw new Error(`Checksums: ${res.status} ${res.statusText}`);
      const expected = parseChecksums(await res.text())[release.zip.name];
      if (!expected) throw new Error(`${release.zip.name} is missing from the checksums file`);
      if (expected !== sha) throw new Error(`Checksum mismatch for ${release.zip.name}: the download is damaged or not the published file`);
      verified = true;
    }

    onProgress({ phase: 'extract' });
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging);
    await extract(zipFile, staging);
    // A zip with everything inside one folder: use that folder.
    let content = staging;
    const top = readdirSync(staging);
    if (!existsSync(join(staging, app.exe)) && top.length === 1 && statSync(join(staging, top[0])).isDirectory()) content = join(staging, top[0]);
    if (!existsSync(join(content, app.exe))) throw new Error(`${app.exe} not found in ${release.zip.name}`);

    const target = join(dir, release.version);
    rmSync(target, { recursive: true, force: true });
    renameSync(content, target);

    const before = store.installed(app.id);
    store.setInstalled(app.id, {
      version: release.version, installedAt: new Date().toISOString(), verified,
      previous: before && !before.path && before.version !== release.version ? before.version : before?.previous || null
    });
    return store.installed(app.id);
  } finally {
    rmSync(zipFile, { force: true });
    rmSync(staging, { recursive: true, force: true });
    cleanup(app, { root, store });
  }
}

// Removes every version folder except the installed one and the one before it, plus leftovers of broken downloads.
// A folder that is still in use (that version is running) stays and is tried again next time.
export function cleanup(app, { root, store }) {
  const dir = appDir(root, app.id);
  if (!existsSync(dir)) return;
  const info = store.installed(app.id);
  const keep = new Set([info?.version, info?.previous].filter(Boolean));
  for (const name of readdirSync(dir)) {
    if (keep.has(name)) continue;
    try { rmSync(join(dir, name), { recursive: true, force: true, maxRetries: 2 }); } catch {}
  }
}

// Starts the installed version on its own; the launcher may close afterwards.
export function launch(app, { root, store }) {
  const info = store.installed(app.id);
  if (!info) throw new Error(`${app.name} is not installed`);
  const exe = installedExe(root, app, info);
  if (!existsSync(exe)) throw new Error(`${exe} is missing; install ${app.name} again`);
  const child = spawn(exe, app.args || [], { cwd: dirname(exe), detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid;
}
