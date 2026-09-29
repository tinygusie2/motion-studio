import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTouchDevices, pickTouchDevice, createTouchParser } from '../src/touch.mjs';

const LP = `add device 1: /dev/input/event1
  name:     "gpio-keys"
  events:
    KEY (0001): KEY_POWER
add device 2: /dev/input/event2
  name:     "fts_ts"
  events:
    KEY (0001): BTN_TOUCH
    ABS (0003): ABS_MT_SLOT           : value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_X     : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_Y     : value 0, min 0, max 2399, fuzz 0, flat 0, resolution 0
  input props:
    INPUT_PROP_DIRECT
`;

test('finds the touch screen and its range', () => {
  const dev = pickTouchDevice(LP);
  assert.equal(dev.path, '/dev/input/event2');
  assert.equal(dev.x, 1079); assert.equal(dev.y, 2399);
  assert.equal(parseTouchDevices('').length, 0);
  assert.equal(pickTouchDevice('add device 1: /dev/input/event1\n  name: "gpio-keys"\n'), null);
});

const line = (code, val, type = 'EV_ABS') => `[ 100.000000] /dev/input/event2: ${type.padEnd(12)} ${code.padEnd(20)} ${val}`;
function run(lines, opts) {
  const out = [];
  const feed = createTouchParser({ x: 1000, y: 2000 }, [400, 800], (ev, at) => out.push({ ...ev, at }), opts);
  lines.forEach(([l, at]) => feed(l, at));
  return out;
}

test('a tap comes out as down and up in css pixels', () => {
  const ev = run([
    [line('ABS_MT_TRACKING_ID', '00000012'), 0], [line('ABS_MT_POSITION_X', '000001f4'), 0], [line('ABS_MT_POSITION_Y', '000003e8'), 0],
    [line('BTN_TOUCH', 'DOWN', 'EV_KEY'), 0], [line('SYN_REPORT', '00000000', 'EV_SYN'), 0],
    [line('ABS_MT_TRACKING_ID', 'ffffffff'), 80], [line('BTN_TOUCH', 'UP', 'EV_KEY'), 80], [line('SYN_REPORT', '00000000', 'EV_SYN'), 80]
  ]);
  assert.deepEqual(ev.map(e => e.type), ['down', 'up']);
  assert.equal(ev[0].x, 200); assert.equal(ev[0].y, 400);
  assert.equal(ev[1].at, 80);
});

test('a swipe gives thinned moves and ends where the finger left', () => {
  const rows = [[line('ABS_MT_TRACKING_ID', '00000001'), 0], [line('ABS_MT_POSITION_X', '00000064'), 0], [line('ABS_MT_POSITION_Y', '00000064'), 0], [line('SYN_REPORT', '0', 'EV_SYN'), 0]];
  for (let i = 1; i <= 20; i++) rows.push([line('ABS_MT_POSITION_Y', (100 + i * 50).toString(16).padStart(8, '0')), i * 8], [line('SYN_REPORT', '0', 'EV_SYN'), i * 8]);
  rows.push([line('ABS_MT_TRACKING_ID', 'ffffffff'), 170], [line('SYN_REPORT', '0', 'EV_SYN'), 170]);
  const ev = run(rows);
  assert.equal(ev[0].type, 'down'); assert.equal(ev.at(-1).type, 'up');
  const moves = ev.filter(e => e.type === 'move');
  assert.ok(moves.length > 2 && moves.length < 10, `moves ${moves.length}`);
  assert.equal(ev.at(-1).y, 440);
});

test('a second finger is ignored', () => {
  const ev = run([
    [line('ABS_MT_TRACKING_ID', '00000001'), 0], [line('ABS_MT_POSITION_X', '00000064'), 0], [line('ABS_MT_POSITION_Y', '00000064'), 0], [line('SYN_REPORT', '0', 'EV_SYN'), 0],
    [line('ABS_MT_SLOT', '00000001'), 10], [line('ABS_MT_TRACKING_ID', '00000002'), 10], [line('ABS_MT_POSITION_X', '000003e0'), 10], [line('SYN_REPORT', '0', 'EV_SYN'), 10],
    [line('ABS_MT_TRACKING_ID', 'ffffffff'), 20], [line('ABS_MT_SLOT', '00000000'), 30], [line('SYN_REPORT', '0', 'EV_SYN'), 30],
    [line('ABS_MT_TRACKING_ID', 'ffffffff'), 60], [line('SYN_REPORT', '0', 'EV_SYN'), 60]
  ]);
  assert.deepEqual(ev.map(e => e.type), ['down', 'up']);
  assert.equal(ev[0].x, 40);
  assert.equal(ev[1].at, 60);
});

test('a driver that only reports changed axes: the second touch starts where the last one left the unchanged axis', () => {
  const ev = run([
    [line('ABS_MT_TRACKING_ID', '00000001'), 0], [line('ABS_MT_POSITION_X', '000001f4'), 0], [line('ABS_MT_POSITION_Y', '000003e8'), 0], [line('SYN_REPORT', '0', 'EV_SYN'), 0],
    [line('ABS_MT_TRACKING_ID', 'ffffffff'), 50], [line('SYN_REPORT', '0', 'EV_SYN'), 50],
    [line('ABS_MT_TRACKING_ID', '00000002'), 900], [line('ABS_MT_POSITION_Y', '000007d0'), 900], [line('SYN_REPORT', '0', 'EV_SYN'), 900],
    [line('ABS_MT_TRACKING_ID', 'ffffffff'), 960], [line('SYN_REPORT', '0', 'EV_SYN'), 960]
  ]);
  assert.deepEqual(ev.map(e => e.type), ['down', 'up', 'down', 'up']);
  assert.equal(ev[2].x, 200); assert.equal(ev[2].y, 800);
});
