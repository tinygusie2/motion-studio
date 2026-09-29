// Silence in a clip's sound: reading ffmpeg's silencedetect output and turning it into the stretches to cut.
// Pure module, also served to the editor at /lib/silence.mjs.

export const silenceLevels = {
  normal: { db: -35, label: 'Normaal' },
  strict: { db: -30, label: 'Streng (ook zachte stukken weg)' },
  gentle: { db: -42, label: 'Mild (alleen echte stilte)' }
};

// "silence_start: 1.2" / "silence_end: 2.5 | silence_duration: 1.3" lines of `-af silencedetect` → [{ s, e }].
// A silence still open at the end of the file runs to `total`.
export function parseSilences(text, total = Infinity) {
  const out = [];
  let open = null;
  for (const line of String(text).split(/\r?\n/)) {
    let m = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (m) { open = Math.max(0, +m[1]); continue; }
    m = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (m && open != null) { out.push({ s: +open.toFixed(3), e: +Math.min(+m[1], total).toFixed(3) }); open = null; }
  }
  if (open != null && Number.isFinite(total) && total > open) out.push({ s: +open.toFixed(3), e: +total.toFixed(3) });
  return out.filter(x => x.e > x.s);
}

// The parts of a clip to cut, in video time. `silences` are in source seconds; the clip shows the source from `media`
// at `rate`, from video time `start` for `dur` seconds. A silence is only cut when it is longer than `minCut`, and
// `pad` seconds of it stay on each side so words do not start or stop abruptly. Returns [[t0, t1], …].
export function silenceCuts(silences, clip, { minCut = 0.4, pad = 0.12 } = {}) {
  const rate = clip.rate || 1, media = clip.media || 0;
  const toT = x => clip.start + (x - media) / rate;
  const from = clip.start, to = clip.start + clip.dur;
  const cuts = [];
  for (const s of silences || []) {
    if (s.e - s.s < minCut) continue;
    const a = Math.max(from, toT(s.s + pad)), b = Math.min(to, toT(s.e - pad));
    if (b - a >= 0.05) cuts.push([+a.toFixed(3), +b.toFixed(3)]);
  }
  return cuts;
}

// Speech recognition drifts when the audio has long silences (the first word after one is stretched over it). So the
// recogniser gets the audio without them: `speechSegments` are the parts to keep, [[from, to], …] in seconds, with
// `pad` seconds of each silence kept next to the speech (none at the very start or end); only silences of at least `minGap` seconds are removed.
export function speechSegments(silences, total, { minGap = 0.6, pad = 0.15 } = {}) {
  const cuts = (silences || []).filter(s => s.e - s.s >= minGap).map(s => [s.s <= 0.001 ? 0 : s.s + pad, s.e >= total - 0.001 ? total : s.e - pad]).filter(([a, b]) => b - a > 0.05).sort((x, y) => x[0] - y[0]);
  const segs = [];
  let at = 0;
  for (const [a, b] of cuts) { if (a > at) segs.push([at, a]); at = Math.max(at, b); }
  if (at < total) segs.push([at, total]);
  return segs.filter(([a, b]) => b - a > 0.05).map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]);
}
// A time in the audio made of those segments back to the time in the original audio.
export function mapFromSegments(segs, x) {
  let c = 0;
  for (const [a, b] of segs) {
    if (x < c + (b - a)) return +(a + Math.max(0, x - c)).toFixed(3);
    c += b - a;
  }
  return segs.length ? segs[segs.length - 1][1] : x;
}
