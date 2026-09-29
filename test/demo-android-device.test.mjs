// The Android demo source against a real device or an emulator. Skipped unless you name one:
//   MS_TEST_ANDROID=emulator-5554 npm test
// It never picks a device by itself, so a phone that happens to be plugged in is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { AndroidDemo, findAdb } from '../src/demo-android.mjs';
import { analyzeGestures } from '../src/gestures.mjs';

const serial = process.env.MS_TEST_ANDROID;
const adb = findAdb();
const skip = serial && adb && !spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status ? false : 'set MS_TEST_ANDROID to a device serial (needs adb and ffmpeg)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = (cmd, args) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { windowsHide: true });
  let out = '';
  p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d));
  p.on('close', c => (c ? fail(new Error(`${cmd} ${args.join(' ')} -> ${c}\n${out.slice(-300)}`)) : ok(out)));
});

test('android: live picture, a recording with the right length and its gestures', { skip }, async () => {
  let frames = 0;
  const d = await AndroidDemo.open({ adb, serial, run }, { onFrame: () => frames++ });
  try {
    await sleep(2500);
    assert.ok(frames >= 1, 'a picture of the screen arrives');
    assert.equal(d.css[0], 390);
    await d.startRecording();
    await sleep(600);
    const [w, h] = d.css;
    await d.input({ type: 'down', x: w / 2, y: h / 2 }); await sleep(60); await d.input({ type: 'up', x: w / 2, y: h / 2 });
    await sleep(900);
    await d.input({ type: 'down', x: w * 0.75, y: h / 2 }); await sleep(30); await d.input({ type: 'move', x: w * 0.5, y: h / 2 }); await sleep(30); await d.input({ type: 'up', x: w * 0.25, y: h / 2 });
    await sleep(1200);
    const rec = await d.stopRecording();
    try {
      assert.ok(rec.dur > 2.5 && rec.dur < 8, `dur ${rec.dur}`);
      assert.ok(statSync(rec.file).size > 1000);
      const probe = (await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'csv=p=0', rec.file])).trim().split('\n');
      assert.match(probe[0], /30\/1/);
      assert.ok(Math.abs(+probe[probe.length - 1] - rec.dur) < 0.3, 'the video is as long as the recording');
      const g = analyzeGestures(rec.events, d.css);
      assert.deepEqual(g.map(x => x.kind), ['tap', 'swipe']);
      assert.ok(g[0].t > 0.4 && g[0].t < 1.6, `the tap at ${g[0].t}`);
    } finally { d.discard(rec); }
  } finally { await d.close(); }
});
