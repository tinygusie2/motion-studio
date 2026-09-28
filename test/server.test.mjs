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
