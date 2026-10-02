import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGestures, tapsFromGestures, screenToDevice, insetFor } from '../src/gestures.mjs';
import { fieldKind, pickValue, defaultDatasets, storageScript, storageEntries, typingPlan, eventTime } from '../src/demo.mjs';
import { layouts } from '../src/template.mjs';

const ev = (t, type, x, y, extra = {}) => ({ t, type, x, y, ...extra });

test('gestures: taps, holds and swipes from pointer events', () => {
  const g = analyzeGestures([
    ev(1, 'down', 100, 200), ev(1.08, 'up', 102, 201),
    ev(2, 'down', 50, 60), ev(2.7, 'up', 50, 60),
    ev(3, 'down', 200, 500), ev(3.05, 'move', 200, 400), ev(3.2, 'move', 200, 300), ev(3.3, 'up', 200, 300)
  ]);
  assert.deepEqual(g.map(x => x.kind), ['tap', 'hold', 'swipe']);
  assert.deepEqual([g[0].x, g[0].y], [100, 200]);
  assert.equal(g[1].dur, 0.7);
  assert.deepEqual([g[2].x, g[2].y, g[2].x2, g[2].y2, g[2].dur], [200, 500, 200, 300, 0.3]);
  // Events out of order and a finger still down at the end are handled.
  const late = analyzeGestures([ev(5, 'move', 10, 90), ev(4, 'down', 10, 10)]);
  assert.equal(late[0].kind, 'swipe');
});

test('gestures: scrolling with the wheel becomes one swipe in the finger direction', () => {
  const g = analyzeGestures([ev(1, 'wheel', 200, 400, { dx: 0, dy: 120 }), ev(1.1, 'wheel', 200, 400, { dx: 0, dy: 120 }), ev(1.2, 'wheel', 200, 400, { dx: 0, dy: 120 }), ev(3, 'wheel', 200, 400, { dx: 0, dy: -100 })], [390, 844]);
  assert.equal(g.length, 2);
  assert.equal(g[0].kind, 'swipe'); assert.equal(g[0].via, 'wheel');
  assert.ok(g[0].y > g[0].y2, 'page moves up: the finger moves up');
  assert.ok(g[1].y < g[1].y2, 'scrolling back: the finger moves down');
  assert.ok(g.every(x => x.y >= 24 && x.y2 <= 844 - 24 && x.x === 200));
});

test('gestures: typed text is grouped', () => {
  const g = analyzeGestures([ev(1, 'text', 0, 0, { text: 'ja' }), ev(1.2, 'text', 0, 0, { text: 'n' }), ev(4, 'text', 0, 0, { text: 'x' })]);
  assert.deepEqual(g.map(x => [x.kind, x.text]), [['type', 'jan'], ['type', 'x']]);
});

test('tapsFromGestures: screen pixels land inside the device, time is shifted, typing is skipped', () => {
  const gs = analyzeGestures([ev(1, 'down', 100, 200), ev(1.1, 'up', 100, 200), ev(2, 'down', 300, 900), ev(2.2, 'move', 300, 500), ev(2.4, 'up', 300, 500), ev(3, 'text', 0, 0, { text: 'hi' }), ev(4, 'down', 10, 10), ev(4.8, 'up', 10, 10)]);
  const taps = tapsFromGestures(gs, layouts.phone.inset, { shift: 0.5 });
  assert.equal(taps.length, 3);
  assert.deepEqual(taps[0], { t: 1.5, x: 112, y: 212 });
  assert.deepEqual([taps[1].x, taps[1].y, taps[1].x2, taps[1].y2, taps[1].dur], [312, 912, 312, 512, 0.4]);
  assert.equal(taps[2].hold, 0.8);
  assert.equal(tapsFromGestures(gs.slice(0, 1), layouts.phone.inset, { shift: -5 })[0].t, 0.3, 'never before 0.3 s');
  assert.equal(tapsFromGestures(gs.slice(0, 1), [0, 0, 1], { cursor: true })[0].style, 'cursor');
});

test('every layout has an inset that keeps its whole screen inside the device', () => {
  for (const [name, l] of Object.entries(layouts)) {
    const [dx, dy] = screenToDevice(l.inset, l.screen[0], l.screen[1]);
    assert.ok(dx <= l.dev[0] + 1 && dy <= l.dev[1] + 1, `${name}: ${dx}×${dy} in ${l.dev}`);
    assert.ok(l.inset[0] >= 0 && l.inset[1] >= 0 && l.inset[2] > 0, name);
  }
});

test('fieldKind: recognises inputs by type and by Dutch and English hints', () => {
  const k = h => fieldKind(h);
  assert.equal(k({ type: 'email' }), 'email');
  assert.equal(k({ type: 'password' }), 'password');
  assert.equal(k({ type: 'text', placeholder: 'Je e-mailadres' }), 'email');
  assert.equal(k({ type: 'text', name: 'username' }), 'username', 'username is not just a name');
  assert.equal(k({ type: 'text', label: 'Voornaam' }), 'firstName');
  assert.equal(k({ type: 'text', label: 'Achternaam' }), 'lastName');
  assert.equal(k({ type: 'text', label: 'Naam' }), 'name');
  assert.equal(k({ type: 'text', id: 'q', aria: 'Zoek in de app' }), 'search');
  assert.equal(k({ type: 'text', tag: 'textarea', name: 'x' }), 'message');
  assert.equal(k({ type: 'text', name: 'zzz' }), null);
  // Whole words, so a word inside another one does not count.
  assert.equal(k({ type: 'text', placeholder: 'Your message' }), 'message', 'not "age"');
  assert.equal(k({ type: 'text', name: 'first_name' }), 'firstName');
  assert.equal(k({ type: 'text', id: 'firstName' }), 'firstName');
  assert.equal(k({ type: 'text', id: 'user_name' }), 'username');
  assert.equal(k({ type: 'text', placeholder: 'E-mailadres' }), 'email');
  assert.equal(k({ type: 'text', name: 'emailAddress' }), 'email');
  assert.equal(k({ type: 'text', placeholder: 'Hotel' }), null, 'not "tel"');
  assert.equal(k({ type: 'text', label: 'Postal code' }), 'zip');
});

test('pickValue: the dataset value for an input, with fallbacks between name parts', () => {
  const d = defaultDatasets('nl')[0];
  assert.equal(pickValue(d, { type: 'email' }).value, 'jan@voorbeeld.nl');
  assert.equal(pickValue(d, { label: 'Voornaam' }).value, 'Jan');
  assert.equal(pickValue({ fields: { name: 'Jan de Vries' } }, { label: 'Achternaam' }).value, 'de Vries');
  assert.equal(pickValue({ fields: { firstName: 'A', lastName: 'B' } }, { label: 'Naam' }).value, 'A B');
  assert.equal(pickValue({ fields: { klantnummer: 'K-1001' } }, { placeholder: 'Klantnummer' }).value, 'K-1001', 'custom fields match by their key');
  assert.equal(pickValue(d, { name: 'zzz' }), null);
  assert.equal(pickValue({ fields: {} }, { type: 'email' }), null);
});

test('storage: entries and the script that sets them before the app runs', () => {
  const d = { storage: { local: { token: 'abc', user: { id: 1 } }, session: { s: '1' }, cookies: [{ name: 'a', value: 'b' }, {}] } };
  const { entries, cookies } = storageEntries(d);
  assert.deepEqual(entries.map(e => [e.kind, e.key, e.value]), [['local', 'token', 'abc'], ['local', 'user', '{"id":1}'], ['session', 's', '1']]);
  assert.equal(cookies.length, 1);
  assert.match(storageScript(d), /localStorage\.setItem\("token", "abc"\)/);
  assert.equal(storageScript({}), '');
});

test('typingPlan: one delay per character, believable, and the same every time', () => {
  const p = typingPlan('Hallo, wereld.');
  assert.equal(p.length, 14);
  assert.ok(p.every(d => d >= 55 && d <= 420));
  assert.deepEqual(typingPlan('Hallo, wereld.'), p);
  assert.notDeepEqual(typingPlan('Hallo, wereld.', 8), p);
});

test('insetFor: gestures in css pixels land on the same spot of the layout screen', () => {
  const inset = insetFor(layouts.phone, [390, 844]);
  assert.deepEqual(screenToDevice(inset, 0, 0), [12, 12]);
  const [x, y] = screenToDevice(inset, 390, 844);
  assert.ok(Math.abs(x - (12 + 616)) <= 1 && Math.abs(y - (12 + 1334)) <= 2, `${x},${y}`);
  const [mx, my] = screenToDevice(inset, 195, 422);
  assert.ok(Math.abs(mx - (12 + 308)) <= 1 && Math.abs(my - (12 + 667)) <= 1, 'the middle stays the middle');
  // A tablet and a browser window keep their own insets.
  assert.deepEqual(screenToDevice(insetFor(layouts.browser, [1280, 814]), 0, 0), [0, 64]);
});

test('latency: scene scores are read from ffmpeg, and the delay is the median time until the picture changes', async () => {
  const { parseSceneScores, estimateDelay } = await import('../src/latency.mjs');
  const text = `frame:0    pts:0       pts_time:0
lavfi.scene_score=0.000000
frame:1    pts:1000    pts_time:0.033
lavfi.scene_score=0.410000
frame:2    pts:2000    pts_time:2.5
lavfi.scene_score=1.2e-3`;
  assert.deepEqual(parseSceneScores(text), [{ t: 0, score: 0 }, { t: 0.033, score: 0.41 }, { t: 2.5, score: 0.0012 }]);

  const changes = [{ t: 1.42, score: 0.3 }, { t: 3.9, score: 0.2 }, { t: 6.55, score: 0.4 }, { t: 9.6, score: 0.1 }];
  const gestures = [{ kind: 'tap', t: 1 }, { kind: 'type', t: 2, text: 'x' }, { kind: 'swipe', t: 3.5 }, { kind: 'tap', t: 6 }, { kind: 'tap', t: 8 }];
  const est = estimateDelay(gestures, changes);
  assert.deepEqual(est.samples, [0.42, 0.4, 0.55], 'the tap at 8 s has no reaction within 1.5 s');
  assert.equal(est.delay, 0.42, 'the median');
  // A change that started before the tap is not its reaction, and one that belongs to the next gesture is not either.
  assert.deepEqual(estimateDelay([{ kind: 'tap', t: 1 }, { kind: 'tap', t: 1.3 }], [{ t: 1.2, score: 0.5 }]).samples, [0.2]);
  assert.equal(estimateDelay([{ kind: 'tap', t: 5 }], [{ t: 5.005, score: 0.5 }]).delay, null, 'less than 20 ms: already going on');
  assert.equal(estimateDelay([], changes).delay, null);
});

test('eventTime: the stamp the editor gave an event, unless it is missing or far off', () => {
  assert.equal(eventTime({ at: 1000 }, 1600), 1000, 'a quick tap stays quick when its request arrives late');
  assert.equal(eventTime({}, 1600), 1600);
  assert.equal(eventTime({ at: 'x' }, 1600), 1600);
  assert.equal(eventTime({ at: 1600 - 60000 }, 1600), 1600, 'a clock that is off by a minute is not trusted');
});
