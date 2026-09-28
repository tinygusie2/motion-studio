// Audio mix: the voice track (v.audio, v.audioVol) plus a music bed (v.music) that fades in/out and ducks
// while the voice speaks. The bed's level is written as a HyperFrames volume lane (data-automation), and the
// preview player evaluates the same points, so what plays in the editor is what the render mixes.
// Pure module: used by the template and served to the editor UI at /lib/audio.mjs.

export const musicDefaults = { start: 0, media: 0, vol: 0.35, fadeIn: 0.5, fadeOut: 1.5, duck: 0.3, carve: 0.5 };
// Voice carve: while the voice speaks, the bed also dips in the bands speech needs (on top of the duck), so the
// music can stay louder and fuller. [frequency Hz, q, share of the deepest cut]; the deepest cut is CARVE_DB × carve.
export const CARVE_BANDS = [[800, 1.4, 0.6], [1600, 1.4, 1], [3000, 1.4, 0.7]];
const CARVE_DB = 12;
const ATTACK = 0.25, RELEASE = 0.6, MERGE_GAP = 0.7;

// A generated voice-over (v.vo.file, made by "Voice-over maken") is one file with every line mixed in at the time it
// had then; each line remembers that spot (`at`). Played back per line, a line that was moved later on the timeline
// takes its own piece of the file along: [{ t, at, dur }] (video time, file time, length). A line without `at` (new,
// or its text changed since) has no audio yet. null: play v.audio as one track from 0 (an uploaded recording).
const TAIL = 0.15; // keep the breath and reverb after the last word
export function voiceSegments(v) {
  if (!v.audio || !v.vo?.file || v.vo.file !== v.audio) return null;
  const dur = v.dur ?? 15;
  const lines = (v.vo.lines || []).filter(l => l.at != null && l.len > 0);
  const ats = lines.map(l => l.at).sort((a, b) => a - b);
  return lines.map(l => {
    const next = ats.find(a => a > l.at + 0.001) ?? Infinity; // don't play into the next line's first word
    const len = Math.min(l.len + TAIL, next - l.at, dur - l.t);
    return { t: l.t, at: l.at, dur: +len.toFixed(3) };
  }).filter(s => s.dur > 0.05 && s.t < dur);
}

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
  const carve = Math.min(1, Math.max(0, +m.carve || 0));
  const spans = v.audio && (duck < 1 || carve > 0) ? speechSpans(v).map(([a, b]) => [a - start, b - start]).filter(([a, b]) => b > 0 && a < dur) : [];
  // 0..1: how much the voice is speaking at t (ramps in before a line, eases out after it).
  const speakAt = t => {
    let d = 0;
    for (const [a, b] of spans) d = Math.max(d, t >= a && t <= b ? 1 : t < a && t > a - ATTACK ? (t - (a - ATTACK)) / ATTACK : t > b && t < b + RELEASE ? 1 - (t - b) / RELEASE : 0);
    return d;
  };
  const duckAt = t => 1 - speakAt(t) * (1 - duck);
  const fadeAt = t => Math.max(0, Math.min(1, m.fadeIn > 0 ? t / m.fadeIn : 1, m.fadeOut > 0 ? (dur - t) / m.fadeOut : 1));
  const gain = t => Math.min(1, Math.max(0, +m.vol)) * fadeAt(t) * duckAt(t);
  const ts = new Set([0, +dur.toFixed(3)]);
  const add = x => { if (x >= 0 && x <= dur) ts.add(+x.toFixed(3)); };
  for (const [a, b] of spans) { add(a - ATTACK); add(a); add(b); add(b + RELEASE); }
  for (let x = 0; x < m.fadeIn; x += 0.1) add(x);
  add(m.fadeIn);
  for (let x = 0; x < m.fadeOut; x += 0.1) add(dur - x);
  add(dur - m.fadeOut);
  const times = [...ts].sort((a, b) => a - b).slice(0, 512);
  const points = times.map(t => ({ t, v: +gain(t).toFixed(4) }));
  // The carve: a HyperFrames fx chain of peaking filters plus one gain lane per filter (dB, clip-local).
  const fx = carve > 0 && spans.length ? {
    chain: { version: 1, nodes: CARVE_BANDS.map(([f, q], i) => ({ type: 'peaking', id: `carve${i + 1}`, label: `Voice carve ${f} Hz`, params: { frequency: f, gain: 0, q } })) },
    lanes: CARVE_BANDS.map(([, , share], i) => ({ target: `fx.carve${i + 1}.gain`, points: times.map(t => ({ t, v: +(-CARVE_DB * carve * share * speakAt(t)).toFixed(2) })) }))
  } : null;
  return { src: m.src, start: +start.toFixed(3), dur: +dur.toFixed(3), media: Math.max(0, +m.media || 0), points, fx };
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
