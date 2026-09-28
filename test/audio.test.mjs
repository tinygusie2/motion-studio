import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechSpans, musicMix, laneAt, CARVE_BANDS } from '../src/audio.mjs';

const video = (music, extra = {}) => ({ dur: 10, audio: 'vo.wav', vo: { lines: [{ t: 1, text: 'a', len: 1.5 }, { t: 2.8, text: 'b', len: 1 }, { t: 6, text: 'c', len: 1 }] }, music: { src: 'm.wav', ...music }, ...extra });

test('speechSpans: lines merge across short pauses', () => {
  assert.deepEqual(speechSpans(video()), [[1, 3.8], [6, 7]]);
  assert.deepEqual(speechSpans({ dur: 8, audio: 'rec.wav', vo: { lines: [] } }), [[0, 8]]);
  assert.deepEqual(speechSpans({ dur: 8, vo: { lines: [] } }), []);
});

test('laneAt: linear between points, ends held', () => {
  const pts = [{ t: 1, v: 0 }, { t: 3, v: 1 }];
  assert.equal(laneAt(pts, 0), 0); assert.equal(laneAt(pts, 2), 0.5); assert.equal(laneAt(pts, 9), 1);
});

test('musicMix: fades, and ducks to vol × duck while speaking', () => {
  const m = musicMix(video({ vol: 0.4, duck: 0.25, fadeIn: 0.5, fadeOut: 1, carve: 0 }));
  assert.equal(m.dur, 10);
  assert.equal(laneAt(m.points, 0), 0);
  assert.equal(laneAt(m.points, 2), 0.1);
  assert.equal(laneAt(m.points, 5), 0.4);
  assert.equal(laneAt(m.points, 10), 0);
  assert.equal(m.fx, null);
});

test('musicMix: carve dips the speech bands while speaking only', () => {
  const m = musicMix(video({ duck: 1, carve: 0.5 }));
  assert.equal(m.fx.chain.nodes.length, CARVE_BANDS.length);
  const deepest = m.fx.lanes.find(l => l.target === 'fx.carve2.gain');
  assert.equal(laneAt(deepest.points, 2), -6);
  assert.equal(laneAt(deepest.points, 5), 0);
  assert.equal(musicMix(video({ carve: 0.5 }, { audio: undefined })).fx, null);
});

test('musicMix: start, trim and source offset', () => {
  const m = musicMix(video({ start: 2, dur: 3, media: 4 }));
  assert.deepEqual([m.start, m.dur, m.media], [2, 3, 4]);
  assert.equal(musicMix(video({ start: 8 })).dur, 2);
});

test('voiceSegments: a generated voice-over plays each line from its own spot in the file, wherever the line is now', async () => {
  const { voiceSegments } = await import('../src/audio.mjs');
  const v = { id: 'demo', dur: 10, audio: 'demo.wav', vo: { file: 'demo.wav', lines: [
    { t: 5, at: 1, len: 2, text: 'moved later' },
    { t: 3.5, at: 3.5, len: 1, text: 'stayed' },
    { t: 8, text: 'new, not spoken yet' }
  ] } };
  assert.deepEqual(voiceSegments(v), [
    { t: 5, at: 1, dur: 2.15 },     // the tail after the last word comes along
    { t: 3.5, at: 3.5, dur: 1.15 }
  ]);
  // The tail stops where the next line starts in the file, and at the end of the video.
  assert.equal(voiceSegments({ ...v, vo: { file: 'demo.wav', lines: [{ t: 0, at: 0, len: 2 }, { t: 9.5, at: 2.05, len: 1 }] } })[0].dur, 2.05);
  assert.equal(voiceSegments({ ...v, vo: { file: 'demo.wav', lines: [{ t: 9.5, at: 2.05, len: 1 }] } })[0].dur, 0.5);
  // An uploaded recording, or a voice-over made before lines kept their spot: one track from 0.
  assert.equal(voiceSegments({ ...v, audio: 'upload.wav' }), null);
  assert.equal(voiceSegments({ ...v, vo: { lines: v.vo.lines } }), null);
});

test('build: the voice plays per line, so a moved line takes its audio along', async () => {
  const { build } = await import('../src/template.mjs');
  const html = build({ id: 'demo', dur: 10, end: 9, audio: 'demo.wav', audioVol: 0.8, vo: { file: 'demo.wav', lines: [{ t: 5, at: 1, len: 2, text: 'a' }] } }, { name: 'X', theme: {} });
  assert.match(html, /<audio id="vo0" src="assets\/vo\/demo\.wav" data-start="5" data-duration="2\.15" data-media-start="1" data-volume="0\.8"/);
  assert.doesNotMatch(html, /id="vo" /);
});
