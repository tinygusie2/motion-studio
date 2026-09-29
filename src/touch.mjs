// Touches on the phone itself, read from `getevent -lt`: the finger down, moving and up, in the same "css" pixels
// as the events the editor sends (see gestures.mjs). Pure parsing; demo-android.mjs runs adb.

// The touch screen out of `getevent -lp`: its path and the largest x and y it reports.
export function parseTouchDevices(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const add = line.match(/^add device \d+:\s*(\S+)/);
    if (add) { cur = { path: add[1], name: '', x: null, y: null, x0: null, y0: null, direct: false, key: false }; out.push(cur); continue; }
    if (!cur) continue;
    const name = line.match(/^name:\s*"(.*)"/);
    if (name) cur.name = name[1];
    // `value` is where the axis is now: a driver only reports axes that changed, so the first touch may lack one.
    const ax = line.match(/^(ABS_MT_POSITION_X|ABS_MT_POSITION_Y|ABS_X|ABS_Y)\s*:\s*value\s+(-?\d+).*\bmax\s+(\d+)/);
    if (ax) {
      const k = ax[1];
      if (k === 'ABS_MT_POSITION_X' || (k === 'ABS_X' && cur.x == null)) { cur.x = +ax[3]; cur.x0 = +ax[2]; }
      if (k === 'ABS_MT_POSITION_Y' || (k === 'ABS_Y' && cur.y == null)) { cur.y = +ax[3]; cur.y0 = +ax[2]; }
    }
    if (/INPUT_PROP_DIRECT/.test(line)) cur.direct = true;
    if (/BTN_TOUCH/.test(line)) cur.key = true;
  }
  return out.filter(d => d.x > 0 && d.y > 0 && (d.direct || d.key || /touch/i.test(d.name)));
}
export function pickTouchDevice(text) {
  const all = parseTouchDevices(text);
  return all.find(d => d.direct) || all.find(d => /touch/i.test(d.name)) || all[0] || null;
}

// Feeds it the lines of `getevent -lt <device>`; it calls `onEvent({type:'down'|'move'|'up', x, y}, at)` with x and y in css
// pixels. `dev` = { x, y } the largest raw values, `css` = [width, height]. Only the first finger counts.
export function createTouchParser(dev, css, onEvent, { moveEvery = 25 } = {}) {
  let slot = 0, touching = false, id = null, rx = dev.x0 ?? null, ry = dev.y0 ?? null, dirty = false, started = false, lastMove = 0;
  const conv = () => ({ x: +(rx / dev.x * css[0]).toFixed(1), y: +(ry / dev.y * css[1]).toFixed(1) });
  const flush = at => {
    if (!dirty && !(touching && !started)) return;
    dirty = false;
    if (touching && rx != null && ry != null) {
      if (!started) { started = true; lastMove = at; onEvent({ type: 'down', ...conv() }, at); }
      else if (at - lastMove >= moveEvery) { lastMove = at; onEvent({ type: 'move', ...conv() }, at); }
    }
  };
  const lift = at => {
    if (!touching) return;
    touching = false; id = null;
    if (started) onEvent({ type: 'up', ...conv() }, at);
    started = false; dirty = false; // rx and ry stay: a driver only reports the axes that changed
  };
  return function feed(line, at = Date.now()) {
    const m = String(line).match(/(EV_ABS|EV_KEY|EV_SYN)\s+(\w+)\s+(\w+)/);
    if (!m) return;
    const [, type, code, val] = m;
    if (type === 'EV_ABS') {
      if (code === 'ABS_MT_TRACKING_ID') {
        if (slot !== 0) return;
        if (/^f+$/i.test(val)) { if (id !== null) lift(at); }
        else if (id === null) { id = val; touching = true; }
      } else if (code === 'ABS_MT_SLOT') slot = parseInt(val, 16) || 0;
      else if (slot === 0 && (id !== null || touching)) {
        if (code === 'ABS_MT_POSITION_X' || code === 'ABS_X') { rx = parseInt(val, 16); dirty = true; }
        else if (code === 'ABS_MT_POSITION_Y' || code === 'ABS_Y') { ry = parseInt(val, 16); dirty = true; }
      }
    } else if (type === 'EV_KEY' && code === 'BTN_TOUCH') {
      if (val === 'DOWN') { touching = true; }
      else if (val === 'UP') lift(at);
    } else if (type === 'EV_SYN' && code === 'SYN_REPORT') flush(at);
  };
}
