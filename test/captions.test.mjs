import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, timeWords, captionGroups, splitSub, toSrt, parseSubtitles, captionStyle, captionDefaults } from '../src/captions.mjs';

test('tokens: *stars* mark accent words and are removed', () => {
  assert.deepEqual(tokens('Tap *import now* please'), [{ w: 'Tap' }, { w: 'import', em: true }, { w: 'now', em: true }, { w: 'please' }]);
  assert.deepEqual(tokens('  '), []);
});

test('timeWords: words start in order, inside the block, first at its start', () => {
  const ws = timeWords({ t: 2, out: 5, text: 'Open your planner and tap the import button.' });
  assert.equal(ws[0].t, 2);
  for (let i = 1; i < ws.length; i++) assert.ok(ws[i].t > ws[i - 1].t);
  assert.ok(ws.at(-1).t < 5);
});

test('captionGroups: at most N words, breaks after a sentence, never past the end', () => {
  const groups = captionGroups([{ t: 0, out: 4, text: 'One two three four. Five six' }], 3, 3.5);
  assert.deepEqual(groups.map(g => g.words.map(w => w.w).join(' ')), ['One two three', 'four.', 'Five six']);
  for (const g of groups) { assert.ok(g.e > g.s); assert.ok(g.e <= 3.5); }
});

test('splitSub: both halves keep their words and meet at the cut', () => {
  const [a, b] = splitSub({ t: 0, out: 2, text: 'een *twee drie* vier' }, 0.9);
  assert.equal(a.out, 0.9); assert.equal(b.t, 0.9);
  assert.equal(`${a.text} ${b.text}`.replace(/\*/g, ''), 'een twee drie vier');
});

test('SRT: written without stars, cut at the end card, and read back', () => {
  const srt = toSrt([{ t: 0.5, out: 3, text: 'Hoi *jij*' }, { t: 4, out: 9, text: 'laat' }, { t: 7, out: 8, text: 'te laat' }], 6);
  assert.match(srt, /00:00:00,500 --> 00:00:03,000\nHoi jij/);
  assert.match(srt, /00:00:04,000 --> 00:00:06,000\nlaat/);
  assert.doesNotMatch(srt, /te laat/);
  assert.deepEqual(parseSubtitles(srt), [{ t: 0.5, out: 3, text: 'Hoi jij' }, { t: 4, out: 6, text: 'laat' }]);
});

test('parseSubtitles: VTT with tags and multi-line cues', () => {
  const subs = parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.500\n<b>Hallo</b> daar\n\n2\n00:00:03,000 --> 00:00:04,000\nTwee\nregels\n');
  assert.deepEqual(subs, [{ t: 1, out: 2.5, text: 'Hallo daar' }, { t: 3, out: 4, text: 'Twee regels' }]);
});

test('captionStyle: defaults < brand < video', () => {
  const cs = captionStyle({ captions: { style: 'box', size: 60 } }, { captions: { size: 80 } });
  assert.equal(cs.style, 'box'); assert.equal(cs.size, 80); assert.equal(cs.words, captionDefaults.words);
});
