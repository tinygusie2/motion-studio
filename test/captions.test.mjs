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

test('exact word times (wo) are used while the word count matches, and survive a split', async () => {
  const { timeWords, splitSub, wordsFromWhisper, subsFromWords, captionGroups } = await import('../src/captions.mjs');
  const sub = { t: 2, out: 4, text: 'een twee drie vier', wo: [0, 0.1, 1.5, 1.8] };
  assert.deepEqual(timeWords(sub).map(w => w.t), [2, 2.1, 3.5, 3.8]);
  assert.deepEqual(timeWords({ ...sub, text: 'een twee drie' }).map(w => w.t).length, 3);
  assert.notDeepEqual(timeWords({ ...sub, text: 'een twee drie' }).map(w => w.t), [2, 2.1, 3.5]); // count changed: estimated again
  assert.deepEqual(timeWords({ ...sub, t: 5, out: 7 }).map(w => w.t), [5, 5.1, 6.5, 6.8]); // moves with the block
  const [a, b] = splitSub(sub, 3.3);
  assert.deepEqual([a.text, b.text], ['een twee', 'drie vier']);
  assert.deepEqual(a.wo, [0, 0.1]);
  assert.deepEqual(timeWords(b).map(w => w.t), [3.5, 3.8]);
  assert.equal(captionGroups([sub], 2)[1].s, 3.5);
});

test('whisper words: glued pieces, dropped sound tags, blocks split on pauses and sentences', async () => {
  const { wordsFromWhisper, subsFromWords } = await import('../src/captions.mjs');
  const seg = (text, from, to) => ({ text, offsets: { from, to } });
  const words = wordsFromWhisper({ transcription: [seg(' [MUSIC]', 0, 500), seg(' Hallo', 1000, 1400), seg(',', 1400, 1450), seg(' dit', 1500, 1700), seg(' is', 1700, 1800), seg(' een', 1800, 1900), seg(' test.', 1900, 2300), seg(' Nu', 4000, 4200), seg(' klaar', 4200, 4600), seg(' (laughs)', 4600, 4700)] });
  assert.deepEqual(words.map(w => w.w), ['Hallo,', 'dit', 'is', 'een', 'test.', 'Nu', 'klaar']);
  assert.equal(words[0].e, 1.45);
  const subs = subsFromWords(words);
  assert.deepEqual(subs.map(s => s.text), ['Hallo, dit is een test.', 'Nu klaar']);
  assert.deepEqual(subs[0].wo, [0, 0.5, 0.7, 0.8, 0.9]);
  assert.equal(subs[0].t, 1);
  assert.ok(subs[0].out > 2.3 && subs[0].out <= 4);
  assert.equal(subsFromWords([]).length, 0);
  // Long runs are cut at maxWords.
  const run = Array.from({ length: 20 }, (_, i) => ({ w: 'w' + i, t: i * 0.3, e: i * 0.3 + 0.25 }));
  assert.ok(subsFromWords(run).every(s => s.text.split(' ').length <= 9));
});
