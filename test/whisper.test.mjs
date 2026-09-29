import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// whisperDir() follows the home folder: point it at a throwaway one.
const home = mkdtempSync(join(tmpdir(), 'ms-whisper-'));
process.env.HOME = process.env.USERPROFILE = home;
const { whisperStatus, whisperModels, modelUrl, WHISPER_ZIP, installWhisper } = await import('../src/whisper.mjs');
const touch = (...p) => { mkdirSync(join(home, '.motion-studio', 'whisper', ...p.slice(0, -1)), { recursive: true }); writeFileSync(join(home, '.motion-studio', 'whisper', ...p), 'x'); };

test('whisperStatus: nothing installed, then the app-installed program and the wanted model', () => {
  const none = whisperStatus({});
  assert.equal(none.model, '');
  assert.equal(none.modelName, null);
  assert.equal(none.want, 'small');
  const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  touch('bin', 'Release', exe); touch('models', whisperModels.base.file);
  const st = whisperStatus({});
  assert.ok(st.cli.endsWith(exe), 'found in a subfolder of bin');
  assert.equal(st.modelName, 'base', 'falls back to the model that is there');
  touch('models', whisperModels.small.file);
  assert.equal(whisperStatus({}).modelName, 'small');
  assert.equal(whisperStatus({ whisperModel: 'base' }).modelName, 'base', 'the chosen model wins');
  assert.equal(whisperStatus({ whisperModel: 'huge' }).want, 'small', 'unknown names fall back');
});

test('settings can point at their own files', () => {
  const own = join(home, 'mine.bin');
  writeFileSync(own, 'x');
  assert.equal(whisperStatus({ whisperModelFile: own }).model, own);
  assert.equal(whisperStatus({ whisperCli: own }).cli, own);
});

test('downloads come from the pinned release and the whisper.cpp model repo', () => {
  assert.match(WHISPER_ZIP, /^https:\/\/github\.com\/ggml-org\/whisper\.cpp\/releases\/download\/v[\d.]+\/whisper-bin-x64\.zip$/);
  assert.match(modelUrl('small'), /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-small\.bin$/);
  return assert.rejects(installWhisper({}, 'nope', () => {}), /Onbekend model/);
});
