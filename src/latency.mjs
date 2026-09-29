// How long a screen takes to react in a recording: from the time a tap was sent to the first change of the picture.
// An Android phone reacts a moment after `adb shell input` is called (adb starts a shell, the phone handles the touch,
// draws, encodes), and that moment differs per phone, so it is measured on every recording instead of guessed.
// Pure functions; only `sceneChanges` runs ffmpeg (through the app's runner).

// ffmpeg's `metadata=print` output → [{ t, score }]: how much the picture changed at every frame (0..1).
export function parseSceneScores(text) {
  const out = [];
  let t = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = /pts_time:([\d.]+)/.exec(line);
    if (m) { t = +m[1]; continue; }
    const s = /lavfi\.scene_score=([\d.eE+-]+)/.exec(line);
    if (s && t != null) { out.push({ t, score: +s[1] }); t = null; }
  }
  return out;
}

// The moments the picture changed (a frame that differs from the one before it by at least `min`).
export async function sceneChanges(file, run, { min = 0.004 } = {}) {
  const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', "scale=160:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-", '-f', 'null', '-']);
  return parseSceneScores(out).filter(f => f.score >= min);
}

// The delay to use: for every tap-like gesture, how long until the picture first changed (within `window` seconds and
// before the next gesture), and the median of those. `changes` are [{ t, score }] of the recording, `gestures` come
// from analyzeGestures. Returns { delay, samples } with delay null when nothing could be measured.
export function estimateDelay(gestures, changes, { window = 1.5, min = 0.02, max = 1.4 } = {}) {
  const times = gestures.filter(g => g.kind === 'tap' || g.kind === 'hold' || g.kind === 'swipe').map(g => g.t).sort((a, b) => a - b);
  const samples = [];
  times.forEach((t, i) => {
    const until = Math.min(t + window, times[i + 1] ?? Infinity);
    const hit = changes.find(c => c.t >= t && c.t < until);
    // A change right at the tap (< 20 ms) was going on before it: not a reaction to it.
    if (hit && hit.t - t >= min && hit.t - t <= max) samples.push(+(hit.t - t).toFixed(3));
  });
  if (!samples.length) return { delay: null, samples };
  const sorted = [...samples].sort((a, b) => a - b), mid = sorted.length >> 1;
  const delay = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { delay: +delay.toFixed(3), samples };
}
