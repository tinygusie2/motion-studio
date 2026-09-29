// What the user did while recording a demo, as gestures, and those gestures as taps for the video.
// Pure module, also served to the editor at /lib/gestures.mjs.
//
// The raw events come from the demo view, in the screen's own pixels (the device's CSS size):
//   { t, type: 'down' | 'move' | 'up', x, y }      a finger or the mouse
//   { t, type: 'wheel', x, y, dx, dy }              scrolling (dy > 0: the page moves up)
//   { t, type: 'text', text }                       typed or filled-in text
// `t` is seconds since the recording started.

const r2 = n => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const gestureDefaults = { tapDist: 14, holdAfter: 0.5, wheelGap: 0.3, textGap: 1.2 };

// → [{ kind: 'tap' | 'hold' | 'swipe' | 'type', t, x, y, x2?, y2?, dur, text?, via? }] sorted by time.
// `size` = [w, h] of the screen, to keep scroll swipes inside it.
export function analyzeGestures(events, size = [390, 844], opts = {}) {
  const o = { ...gestureDefaults, ...opts };
  const out = [];
  let down = null, last = null, wheel = null, text = null;
  const flushWheel = () => {
    if (!wheel) return;
    const horizontal = Math.abs(wheel.dx) > Math.abs(wheel.dy), total = horizontal ? wheel.dx : wheel.dy;
    const len = clamp(Math.abs(total) * 0.6, 140, (horizontal ? size[0] : size[1]) * 0.6);
    const dir = total > 0 ? -1 : 1; // the page moves up when the finger does
    const cx = wheel.x, cy = wheel.y;
    const from = horizontal ? [cx - dir * len / 2, cy] : [cx, cy - dir * len / 2];
    const to = horizontal ? [cx + dir * len / 2, cy] : [cx, cy + dir * len / 2];
    const fit = ([x, y]) => [clamp(x, 24, size[0] - 24), clamp(y, 24, size[1] - 24)];
    const [x, y] = fit(from), [x2, y2] = fit(to);
    out.push({ kind: 'swipe', via: 'wheel', t: wheel.t, x: Math.round(x), y: Math.round(y), x2: Math.round(x2), y2: Math.round(y2), dur: r2(clamp(wheel.end - wheel.t + 0.2, 0.25, 1.2)) });
    wheel = null;
  };
  const flushText = () => { if (text) { out.push({ kind: 'type', t: text.t, dur: r2(text.end - text.t), text: text.text, x: 0, y: 0 }); text = null; } };

  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.type !== 'wheel') flushWheel();
    if (e.type !== 'text') flushText();
    if (e.type === 'down') { down = { t: e.t, x: e.x, y: e.y }; last = { t: e.t, x: e.x, y: e.y }; }
    else if (e.type === 'move' && down) last = { t: e.t, x: e.x, y: e.y };
    else if (e.type === 'up' && down) {
      const end = { t: e.t, x: e.x ?? last.x, y: e.y ?? last.y };
      const dist = Math.hypot(end.x - down.x, end.y - down.y), dur = Math.max(0, end.t - down.t);
      if (dist >= o.tapDist) out.push({ kind: 'swipe', t: down.t, x: Math.round(down.x), y: Math.round(down.y), x2: Math.round(end.x), y2: Math.round(end.y), dur: r2(clamp(dur, 0.12, 1.5)) });
      else if (dur >= o.holdAfter) out.push({ kind: 'hold', t: down.t, x: Math.round(down.x), y: Math.round(down.y), dur: r2(dur) });
      else out.push({ kind: 'tap', t: down.t, x: Math.round(down.x), y: Math.round(down.y), dur: r2(dur) });
      down = null; last = null;
    } else if (e.type === 'wheel') {
      if (wheel && e.t - wheel.end > o.wheelGap) flushWheel();
      if (!wheel) wheel = { t: e.t, end: e.t, x: e.x, y: e.y, dx: 0, dy: 0 };
      wheel.end = e.t; wheel.dx += e.dx || 0; wheel.dy += e.dy || 0;
    } else if (e.type === 'text') {
      if (text && e.t - text.end > o.textGap) flushText();
      if (!text) text = { t: e.t, end: e.t, text: '' };
      text.end = e.t; text.text += e.text || '';
    }
  }
  // Something still held when the recording stopped counts up to its last movement.
  if (down && last) {
    const dist = Math.hypot(last.x - down.x, last.y - down.y);
    out.push(dist >= o.tapDist ? { kind: 'swipe', t: down.t, x: Math.round(down.x), y: Math.round(down.y), x2: Math.round(last.x), y2: Math.round(last.y), dur: r2(clamp(last.t - down.t, 0.12, 1.5)) } : { kind: 'tap', t: down.t, x: Math.round(down.x), y: Math.round(down.y), dur: 0.1 });
  }
  flushWheel(); flushText();
  return out.sort((a, b) => a.t - b.t);
}

// The inset for gestures recorded on a screen of `css` size: the layout's own inset (which is for its screen pixels),
// scaled so that css pixels land in screen pixels first. `layout` is one of the layouts of src/template.mjs.
export const insetFor = (layout, css) => [layout.inset[0], layout.inset[1], layout.inset[2] * layout.screen[0] / css[0]];

// A point on the recorded screen as a point in the device element that taps are placed in (see `inset` of the layouts).
export const screenToDevice = (inset, x, y) => [Math.round(inset[0] + x * inset[2]), Math.round(inset[1] + y * inset[2])];

// The gestures as `taps` of a video: a tap, a hold (`hold` seconds) or a swipe (x2, y2, dur). `inset` = [x, y, scale]
// of the layout, `shift` moves everything in time (where the clip starts in the video, minus where the recording started).
export function tapsFromGestures(gestures, inset = [0, 0, 1], { shift = 0, min = 0.3, cursor = false } = {}) {
  const taps = [];
  for (const g of gestures) {
    if (g.kind === 'type') continue;
    const [x, y] = screenToDevice(inset, g.x, g.y);
    const tap = { t: r2(Math.max(min, g.t + shift)), x, y };
    if (g.kind === 'hold') tap.hold = r2(g.dur);
    if (g.kind === 'swipe') { [tap.x2, tap.y2] = screenToDevice(inset, g.x2, g.y2); tap.dur = g.dur; }
    if (cursor) tap.style = 'cursor';
    taps.push(tap);
  }
  return taps;
}
