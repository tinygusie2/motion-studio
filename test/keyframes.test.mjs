import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kfAt, kfList, kfPlan, kfEases, kfNeutral } from '../src/keyframes.mjs';

test('kfList: sorted, clamped, junk dropped', () => {
  assert.deepEqual(kfList([{ t: 3 }, { t: -1 }, { t: 'x' }, null, { t: 1 }], 2).map(k => k.t), [0, 1, 2]);
  assert.deepEqual(kfList(undefined), []);
});

test('kfAt: neutral without keyframes, holds before the first and after the last, mixes in between', () => {
  assert.deepEqual(kfAt([], 1), kfNeutral);
  const kf = [{ t: 1, x: 100, s: 2, ease: 'none' }, { t: 3, x: 300, s: 1, o: 0, ease: 'none' }];
  assert.equal(kfAt(kf, 0).x, 100);
  assert.equal(kfAt(kf, 9).o, 0);
  assert.deepEqual(kfAt(kf, 2), { x: 200, y: 0, s: 1.5, r: 0, o: 0.5 });
});

test('kfAt: every easing runs from 0 to 1', () => {
  for (const [id, e] of Object.entries(kfEases)) {
    assert.ok(Math.abs(e.fn(0)) < 1e-9, id);
    assert.ok(Math.abs(e.fn(1) - 1) < 1e-9, id);
  }
  // 'Sprong' stays put until the end.
  assert.equal(kfAt([{ t: 0, x: 0 }, { t: 2, x: 50, ease: 'steps(1)' }], 1.9).x, 0);
});

test('kfPlan: a set at the start and one tween per pair, in GSAP names', () => {
  assert.equal(kfPlan([], 1), null);
  const plan = kfPlan([{ t: 0.5, x: 10 }, { t: 2, x: 20, s: 1.5, ease: 'power3.out' }, { t: 2, x: 99 }], 4);
  assert.equal(plan.setAt, 4);
  assert.deepEqual(plan.set, { x: 10, y: 0, scale: 1, rotation: 0, opacity: 1 });
  assert.equal(plan.segs.length, 1);
  assert.deepEqual(plan.segs[0], { t: 4.5, d: 1.5, from: plan.set, to: { x: 20, y: 0, scale: 1.5, rotation: 0, opacity: 1 }, ease: 'power3.out' });
  // Times past `max` are clamped, so a tween never runs past the clip.
  assert.equal(kfPlan([{ t: 0 }, { t: 9 }], 0, 3).segs[0].d, 3);
});
