import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRanges, mapTime, cutRanges, wordRanges } from '../src/edit.mjs';
import { parseSilences, silenceCuts } from '../src/silence.mjs';

test('normalizeRanges: sorted, merged, kept inside the video', () => {
  assert.deepEqual(normalizeRanges([[5, 6], [1, 2], [1.5, 3], [9, 9], [-2, 0.5]], 5.5), [[0, 0.5], [1, 3], [5, 5.5]]);
});

test('mapTime: moments after a cut move earlier, moments inside land on its start', () => {
  const rs = [[1, 2], [4, 5]];
  assert.deepEqual([0.5, 1, 1.5, 2, 3, 4.5, 6].map(x => mapTime(rs, x)), [0.5, 1, 1, 1, 2, 3, 4]);
});

test('cutRanges: clips are cut and closed up, items move, the video gets shorter', () => {
  const v = {
    dur: 12, end: 10,
    heads: [{ t: 0.5 }, { t: 6 }],
    clips: [{ src: 'a.mp4', start: 0, dur: 8, media: 2, rate: 2, tr: 'fade', kf: [{ t: 0 }] }, { src: 'b.png', start: 8, dur: 2 }],
    clips2: [],
    chips: [{ t: 2.5, out: 3.5 }, { t: 3, out: 5 }],
    zooms: [{ t: 4.5, scale: 1.3, dur: 0.5, out: 9 }], taps: [{ t: 7, x: 1, y: 1 }],
    subs: [{ t: 6, out: 8, text: 'later' }], vo: { lines: [{ t: 9, text: 'x' }] }
  };
  const removed = cutRanges(v, [[2, 3], [4, 5]]);
  assert.equal(removed, 2);
  // 0-2, 3-4 and 5-8 of the first clip survive; the media offset counts the rate, later pieces lose transition and keyframes.
  assert.deepEqual(v.clips.map(c => [c.src, c.start, c.dur, c.media, c.tr, !!c.kf]), [['a.mp4', 0, 2, 2, 'fade', true], ['a.mp4', 2, 1, 8, undefined, false], ['a.mp4', 3, 3, 12, undefined, false], ['b.png', 6, 2, undefined, undefined, false]]);
  assert.deepEqual(v.heads.map(h => h.t), [0.5, 4]);
  assert.deepEqual(v.chips.map(c => [c.t, c.out]), [[2, 2.5], [2, 3]]);
  assert.equal(v.zooms[0].t, 3); assert.equal(v.zooms[0].out, 7);
  assert.equal(v.taps[0].t, 5); assert.equal(v.subs[0].t, 4); assert.equal(v.vo.lines[0].t, 7);
  assert.equal(v.end, 8); assert.equal(v.dur, 10);
  assert.equal(cutRanges(v, []), 0);
});

test('cutRanges: caption words inside a cut disappear, the rest keep their exact times', () => {
  const v = { dur: 10, end: 9, clips: [], subs: [{ t: 2, out: 6, text: 'een *twee* drie vier', wo: [0, 1, 2, 3] }] };
  cutRanges(v, [[3, 4]]); // removes "twee"
  assert.equal(v.subs[0].text, 'een drie vier');
  assert.deepEqual(v.subs[0].wo, [0, 1, 2]);
  assert.equal(v.subs[0].t, 2);
  assert.equal(v.subs[0].out, 5);
  const gone = { dur: 10, end: 9, clips: [], subs: [{ t: 2, out: 3, text: 'een', wo: [0] }] };
  cutRanges(gone, [[1.5, 3.5]]);
  assert.deepEqual(gone.subs, []);
});

test('wordRanges: from a word to the next one, neighbours merge', () => {
  const sub = { t: 2, out: 6, text: 'een twee drie vier', wo: [0, 1, 2.5, 3] };
  assert.deepEqual(wordRanges(sub, [1]), [[3, 4.5]]);
  assert.deepEqual(wordRanges(sub, [1, 2]), [[3, 5]]);
  assert.deepEqual(wordRanges(sub, [3]), [[5, 6]]);
  assert.deepEqual(wordRanges({ t: 0, out: 1, text: 'a b' }, [0]), []);
});

test('parseSilences / silenceCuts', () => {
  const log = 'x\n[silencedetect @ 0x1] silence_start: 1.5\n[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 2\n[silencedetect @ 0x1] silence_start: 5\n[silencedetect @ 0x1] silence_start: 5.1\n';
  assert.deepEqual(parseSilences(log, 8), [{ s: 1.5, e: 3.5 }, { s: 5.1, e: 8 }]);
  // The clip shows the source from 1 s onward at double speed, from video time 10.
  const clip = { start: 10, dur: 4, media: 1, rate: 2 };
  const cuts = silenceCuts([{ s: 1.5, e: 3.5 }, { s: 4, e: 4.2 }], clip, { pad: 0.2, minCut: 0.4 });
  assert.deepEqual(cuts, [[10.35, 11.15]]); // (1.7-1)/2 ... (3.3-1)/2 after the start; the short silence stays
});

test('speechSegments / mapFromSegments: long silences leave the audio and the times map back', async () => {
  const { speechSegments, mapFromSegments } = await import('../src/silence.mjs');
  const segs = speechSegments([{ s: 0, e: 1.2 }, { s: 3, e: 3.3 }, { s: 5, e: 7 }], 10, { minGap: 0.6, pad: 0.1 });
  assert.deepEqual(segs, [[1.1, 5.1], [6.9, 10]]); // the 0.3 s pause stays, the others are cut down to 0.1 s each side
  assert.equal(mapFromSegments(segs, 0), 1.1);
  assert.equal(mapFromSegments(segs, 2), 3.1);
  assert.equal(mapFromSegments(segs, 4), 6.9); // first moment of the second segment
  assert.equal(mapFromSegments(segs, 5), 7.9);
  assert.deepEqual(speechSegments([], 4), [[0, 4]]);
  assert.deepEqual(speechSegments([{ s: 0, e: 4 }], 4, { pad: 0.1 }), []); // all silence: nothing to listen to
});

test('cutRanges: background changes move with the cut, headline effect names stay', () => {
  const v = { dur: 10, end: 9, heads: [{ t: 0, text: 'A', fxIn: 'pop', fxOut: 'blur' }, { t: 5, text: 'B', fxOut: 'fade' }], bgs: [{ t: 4, style: 'grid' }, { t: 7, style: 'blur' }], clips: [] };
  cutRanges(v, [[2, 3]]);
  assert.deepEqual(v.bgs.map(b => b.t), [3, 6]);
  assert.deepEqual(v.heads.map(h => [h.t, h.fxIn, h.fxOut]), [[0, 'pop', 'blur'], [4, undefined, 'fade']]);
});
