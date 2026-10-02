// Cutting time out of a whole video: what is removed is closed up on every track, so nothing is left with a gap
// and everything after the cut moves earlier. Used for cutting silences and for cutting words out of the transcript.
// Pure module, also served to the editor at /lib/edit.mjs.
import { tokens } from './captions.mjs';

const r3 = n => +n.toFixed(3);
const isImage = src => /\.(png|jpe?g|webp|gif)$/i.test(src || '');

// Sorted, merged ranges inside 0..max, without empty ones.
export function normalizeRanges(ranges, max = Infinity) {
  const list = (ranges || []).map(([a, b]) => [Math.max(0, +a), Math.min(max, +b)]).filter(([a, b]) => b - a > 0.001).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of list) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 0.001) last[1] = Math.max(last[1], r[1]); else out.push([...r]); }
  return out;
}
export const removedBefore = (ranges, x) => ranges.reduce((s, [a, b]) => s + Math.max(0, Math.min(x, b) - a), 0);
// Where a moment ends up once the ranges are gone (a moment inside a cut lands on its start).
export const mapTime = (ranges, x) => r3(x - removedBefore(ranges, x));

// The pieces of [a, b] that survive the ranges.
function pieces(ranges, a, b) {
  const out = [];
  let at = a;
  for (const [s, e] of ranges) {
    if (e <= at) continue;
    if (s >= b) break;
    if (s > at) out.push([at, Math.min(s, b)]);
    at = Math.max(at, e);
    if (at >= b) break;
  }
  if (at < b) out.push([at, b]);
  return out.filter(([x, y]) => y - x > 0.02);
}

const wordText = w => (w.em ? `*${w.w}*` : w.w);

// A caption block with the cut words gone. Blocks with exact word times lose exactly the words inside a cut; the
// others just move. Returns null when nothing is left.
function cutSub(sub, ranges) {
  const toks = tokens(sub.text);
  if (Array.isArray(sub.wo) && sub.wo.length === toks.length && toks.length) {
    const kept = toks.map((w, i) => ({ w, t: sub.t + sub.wo[i] })).filter(({ t }) => !ranges.some(([a, b]) => t >= a - 0.001 && t < b - 0.001));
    if (!kept.length) return null;
    const t = mapTime(ranges, kept[0].t);
    const out = Math.max(mapTime(ranges, sub.out), r3(mapTime(ranges, kept[kept.length - 1].t) + 0.1));
    return { ...sub, t, out, text: kept.map(k => wordText(k.w)).join(' ').replace(/\* \*/g, ' '), wo: kept.map(k => r3(mapTime(ranges, k.t) - t)) };
  }
  const t = mapTime(ranges, sub.t), out = mapTime(ranges, sub.out);
  return out - t > 0.05 ? { ...sub, t, out } : null;
}

// Removes `ranges` ([[t0, t1], …] in video time) from the video `v` (in place): clips are cut and closed up, every
// timed item moves, and the video and its end card start get shorter. The voice/audio track is a file and is not cut.
// Returns the number of seconds removed.
export function cutRanges(v, ranges) {
  const end = v.end ?? v.dur ?? Infinity;
  const rs = normalizeRanges(ranges, end);
  if (!rs.length) return 0;
  const removed = rs.reduce((s, [a, b]) => s + (b - a), 0);
  for (const kind of ['clips', 'clips2']) {
    if (!v[kind]) continue;
    const next = [];
    for (const c of v[kind]) {
      const rate = c.rate || 1;
      pieces(rs, c.start, c.start + c.dur).forEach(([a, b], k) => {
        const p = { ...c, start: mapTime(rs, a), dur: r3(b - a) };
        if (!isImage(c.src)) p.media = r3((c.media || 0) + (a - c.start) * rate);
        if (k > 0) { delete p.tr; delete p.trDur; delete p.kf; }
        next.push(p);
      });
    }
    v[kind] = next;
  }
  for (const list of [v.heads, v.chips, v.zooms, v.taps, v.markers, v.bgs, v.lays]) for (const x of list || []) {
    if (x.t != null) x.t = mapTime(rs, x.t);
    if (x.out != null) x.out = mapTime(rs, x.out);
  }
  if (v.chips) v.chips = v.chips.filter(c => c.out == null || c.out - c.t > 0.05);
  for (const l of v.vo?.lines || []) l.t = mapTime(rs, l.t);
  if (v.subs) v.subs = v.subs.map(s => cutSub(s, rs)).filter(Boolean);
  if (v.end != null) v.end = r3(Math.max(1, v.end - removed));
  if (v.dur != null) v.dur = r3(Math.max((v.end ?? 1) + 0.5, v.dur - removed));
  return r3(removed);
}

// The time ranges of the words at `indexes` in a caption block that has exact word times: from a word's start to the
// start of the next word (or the block's end for the last one). Neighbouring words come out as one range.
export function wordRanges(sub, indexes) {
  const toks = tokens(sub.text);
  if (!Array.isArray(sub.wo) || sub.wo.length !== toks.length) return [];
  const at = i => sub.t + sub.wo[i];
  return normalizeRanges([...indexes].sort((a, b) => a - b).map(i => [at(i), i + 1 < toks.length ? at(i + 1) : sub.out]));
}
