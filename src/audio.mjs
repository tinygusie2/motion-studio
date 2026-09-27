// Audio mix: the voice track (v.audio, v.audioVol) plus a music bed (v.music) that fades in/out and ducks
// while the voice speaks. The bed's level is written as a HyperFrames volume lane (data-automation), and the
// preview player evaluates the same points, so what plays in the editor is what the render mixes.
// Pure module: used by the template and served to the editor UI at /lib/audio.mjs.

export const musicDefaults = { start: 0, media: 0, vol: 0.35, fadeIn: 0.5, fadeOut: 1.5, duck: 0.3 };
const ATTACK = 0.25, RELEASE = 0.6, MERGE_GAP = 0.7;

// When the voice is speaking, in video time: voice-over lines with a known length, merged across short pauses.
// A voice track without VO lines (an uploaded recording) counts as speaking the whole time.
export function speechSpans(v) {
  const lines = (v.vo?.lines || []).filter(l => l.len > 0 && String(l.text || '').trim()).map(l => [l.t, l.t + l.len]).sort((a, b) => a[0] - b[0]);
  if (!lines.length) return v.audio ? [[0, v.dur ?? 15]] : [];
  const out = [lines[0].slice()];
  for (const [a, b] of lines.slice(1)) {
    const last = out[out.length - 1];
    if (a - last[1] < MERGE_GAP) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

// Where the bed sits in the video and its volume envelope, in clip-local seconds.
export function musicMix(v) {
  const m = { ...musicDefaults, ...(v.music || {}) };
  const DUR = v.dur ?? 15;
  const start = Math.max(0, +m.start || 0);
  const dur = Math.max(0.1, Math.min(m.dur ?? Infinity, DUR - start));
  const duck = Math.min(1, Math.max(0, +m.duck));
  const spans = v.audio && duck < 1 ? speechSpans(v).map(([a, b]) => [a - start, b - start]).filter(([a, b]) => b > 0 && a < dur) : [];
  const duckAt = t => {
    let g = 1;
    for (const [a, b] of spans) {
      const d = t >= a && t <= b ? 1 : t < a && t > a - ATTACK ? (t - (a - ATTACK)) / ATTACK : t > b && t < b + RELEASE ? 1 - (t - b) / RELEASE : 0;
      g = Math.min(g, 1 - d * (1 - duck));
    }
    return g;
  };
  const fadeAt = t => Math.max(0, Math.min(1, m.fadeIn > 0 ? t / m.fadeIn : 1, m.fadeOut > 0 ? (dur - t) / m.fadeOut : 1));
  const gain = t => Math.min(1, Math.max(0, +m.vol)) * fadeAt(t) * duckAt(t);
  const ts = new Set([0, +dur.toFixed(3)]);
  const add = x => { if (x >= 0 && x <= dur) ts.add(+x.toFixed(3)); };
  for (const [a, b] of spans) { add(a - ATTACK); add(a); add(b); add(b + RELEASE); }
  for (let x = 0; x < m.fadeIn; x += 0.1) add(x);
  add(m.fadeIn);
  for (let x = 0; x < m.fadeOut; x += 0.1) add(dur - x);
  add(dur - m.fadeOut);
  const points = [...ts].sort((a, b) => a - b).slice(0, 512).map(t => ({ t, v: +gain(t).toFixed(4) }));
  return { src: m.src, start: +start.toFixed(3), dur: +dur.toFixed(3), media: Math.max(0, +m.media || 0), points };
}

// Linear between points, first/last value held (the HyperFrames lane rule).
export function laneAt(points, t) {
  if (!points?.length) return 1;
  if (t <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (t <= b.t) return b.t > a.t ? a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t) : b.v;
  }
  return points[points.length - 1].v;
}
