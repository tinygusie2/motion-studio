// The launcher's updater against a local stand-in for the GitHub API and release downloads.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { crc32 } from 'node:zlib';
import { Store, cleanup, compareVersions, install, latestRelease, parseChecksums } from '../launcher/updater.mjs';

// A zip with stored (uncompressed) entries: { 'path/in/zip': 'content' }.
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), nameBuf = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  const count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
const sha = buf => createHash('sha256').update(buf).digest('hex');

const app = { id: 'demo', name: 'Demo', repo: 'me/demo', asset: '^Demo-.*-win-x64\\.zip$', checksums: 'SHA256SUMS.txt', exe: 'Demo.exe' };
let server, base, home;
const releases = {}; // tag → { zip, sums }
let latest = null;

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'ms-launcher-'));
  server = createServer((req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === '/repos/me/demo/releases/latest') {
      if (!latest) { res.writeHead(404).end('{}'); return; }
      const r = releases[latest];
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        tag_name: latest, name: `Demo ${latest}`, body: 'Notes', html_url: `${base}/r/${latest}`, published_at: '2026-09-29T00:00:00Z',
        assets: [
          { name: `Demo-${latest.slice(1)}-win-x64.zip`, browser_download_url: `${base}/dl/${latest}/zip`, size: r.zip.length },
          ...(r.sums !== undefined ? [{ name: 'SHA256SUMS.txt', browser_download_url: `${base}/dl/${latest}/sums`, size: r.sums.length }] : [])
        ]
      }));
      return;
    }
    const m = url.pathname.match(/^\/dl\/([^/]+)\/(zip|sums)$/);
    if (m && releases[m[1]]) { const body = releases[m[1]][m[2]]; res.writeHead(200, { 'content-length': Buffer.byteLength(body) }).end(body); return; }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(home, { recursive: true, force: true }); });

function publish(tag, files, { sums = true, badSum = false } = {}) {
  const z = zip(files), name = `Demo-${tag.slice(1)}-win-x64.zip`;
  releases[tag] = { zip: z, sums: sums ? `${badSum ? '0'.repeat(64) : sha(z)} *${name}\n` : undefined };
  latest = tag;
}

test('compareVersions orders by number, not by text', () => {
  assert.ok(compareVersions('1.10.0', '1.9.3') > 0);
  assert.ok(compareVersions('v1.2.0', '1.2.1') < 0);
  assert.equal(compareVersions('v2.0.0', '2.0.0-beta'), 0);
});

test('parseChecksums reads sha256sum output in binary and text mode', () => {
  const a = 'a'.repeat(64), b = 'B'.repeat(64);
  assert.deepEqual(parseChecksums(`${a} *One file.zip\r\n${b}  two.zip\n\nnot a line`), { 'One file.zip': a, 'two.zip': b.toLowerCase() });
});

test('no release yet is not an error', async () => {
  assert.equal(await latestRelease(app, { api: base }), null);
});

test('installs, updates, keeps the previous version and refuses a damaged download', async () => {
  const root = join(home, 'root'), store = new Store(root);
  const noop = () => {};

  publish('v1.0.0', { 'Demo.exe': 'one', 'resources/app.txt': 'a' });
  let rel = await latestRelease(app, { api: base });
  assert.equal(rel.version, '1.0.0');
  assert.equal(rel.notes, 'Notes');
  const phases = new Set();
  await install(app, rel, { root, store, onProgress: p => phases.add(p.phase) });
  assert.deepEqual([...phases], ['download', 'verify', 'extract']);
  assert.equal(readFileSync(join(root, 'apps/demo/1.0.0/Demo.exe'), 'utf8'), 'one');
  assert.deepEqual({ ...store.installed('demo'), installedAt: 0 }, { version: '1.0.0', installedAt: 0, verified: true, previous: null });

  // Everything inside one top folder is fine too.
  publish('v1.1.0', { 'Demo-win32-x64/Demo.exe': 'two' });
  await install(app, await latestRelease(app, { api: base }), { root, store, onProgress: noop });
  assert.equal(readFileSync(join(root, 'apps/demo/1.1.0/Demo.exe'), 'utf8'), 'two');
  assert.equal(store.installed('demo').previous, '1.0.0');

  publish('v1.2.0', { 'Demo.exe': 'three' }, { badSum: true });
  await assert.rejects(install(app, await latestRelease(app, { api: base }), { root, store, onProgress: noop }), /Checksum mismatch/);
  assert.equal(store.installed('demo').version, '1.1.0');
  assert.ok(!existsSync(join(root, 'apps/demo/1.2.0')));

  publish('v1.2.1', { 'Other.exe': 'x' });
  await assert.rejects(install(app, await latestRelease(app, { api: base }), { root, store, onProgress: noop }), /Demo\.exe not found/);

  // Without a checksums file it still installs, marked as unverified; the oldest version is cleaned up.
  publish('v1.3.0', { 'Demo.exe': 'four' }, { sums: false });
  await install(app, await latestRelease(app, { api: base }), { root, store, onProgress: noop });
  assert.equal(store.installed('demo').verified, false);
  assert.deepEqual(new Set(['1.1.0', '1.3.0']), new Set(readdirSync(join(root, 'apps/demo'))));

  // The state survives a restart.
  assert.equal(new Store(root).installed('demo').version, '1.3.0');
});

test('cleanup removes stray folders but leaves the current and previous version', () => {
  const root = join(home, 'clean'), store = new Store(root);
  store.setInstalled('demo', { version: '2.0.0', previous: '1.0.0' });
  for (const d of ['0.9.0', '1.0.0', '2.0.0', '.staging-3.0.0']) mkdirSync(join(root, 'apps/demo', d), { recursive: true });
  cleanup(app, { root, store });
  assert.deepEqual(new Set(readdirSync(join(root, 'apps/demo'))), new Set(['1.0.0', '2.0.0']));
});
