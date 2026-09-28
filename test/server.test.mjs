import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep the real ~/.motion-studio out of it: settings go to a throwaway home.
const home = mkdtempSync(join(tmpdir(), 'ms-home-'));
process.env.HOME = process.env.USERPROFILE = home;
const { startServer } = await import('../src/server.mjs');

test('takes the next port in the list when the first is busy', async () => {
  const busy = createServer();
  await new Promise(ok => busy.listen(0, '127.0.0.1', ok));
  const taken = busy.address().port;
  const { server, port } = await startServer({ port: [taken, 0], workspace: join(home, 'none') });
  try {
    assert.notEqual(port, taken);
    assert.ok(port > 0);
  } finally {
    server.close(); busy.close();
  }
});

test('previews load GSAP from the app, not from a CDN, so they work offline', async () => {
  const { createWorkspace } = await import('../src/workspace.mjs');
  const dir = join(home, 'offline');
  createWorkspace(dir, 'Offline');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'specs', 'demo.json'), JSON.stringify({ brand: 'brand', heads: [{ t: 0, text: 'Hi' }], clips: [] }));
  const { server, url } = await startServer({ port: 0, workspace: dir });
  try {
    const page = await (await fetch(`${url}/preview/demo/`)).text();
    assert.doesNotMatch(page, /<script src="https?:/, 'no scripts from the network');
    assert.match(page, /<script src="gsap\.min\.js">/);
    const gsap = await fetch(`${url}/preview/demo/gsap.min.js`);
    assert.equal(gsap.status, 200);
    assert.match(await gsap.text(), /GSAP 3\./);
  } finally {
    server.close();
  }
});
