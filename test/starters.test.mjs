import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starters, starterSpec } from '../src/starters.mjs';
import { build, layouts } from '../src/template.mjs';

const dev = Object.fromEntries(Object.entries(layouts).map(([k, l]) => [k, l.dev]));
const ctx = { brandId: 'b', brandName: 'MyApp', lang: 'en', clips: ['a.mp4', 'b.png'], clipDur: { 'a.mp4': 4 }, dev };

test('every starter makes a video that builds, with everything inside its length', () => {
  for (const id of Object.keys(starters)) {
    const v = starterSpec(id, ctx);
    assert.ok(layouts[v.layout], id);
    assert.ok(v.end < v.dur, id);
    const items = [...v.heads, ...v.chips, ...v.zooms, ...v.taps, ...v.subs, ...v.clips, ...v.clips2];
    for (const it of items) {
      const from = it.t ?? it.start, to = it.out ?? (it.start != null ? it.start + it.dur : it.t);
      assert.ok(from >= 0 && to <= v.end + 0.001, `${id}: item at ${from}-${to} runs past the end card (${v.end})`);
    }
    assert.match(build({ id, ...v }, { name: 'MyApp', theme: {} }), /<html/i, id);
  }
});

test('clips come from the project; a known video length is respected', () => {
  const v = starterSpec('launch', ctx);
  assert.deepEqual([...new Set(v.clips.map(c => c.src))].sort(), ['a.mp4', 'b.png']);
  for (const c of v.clips.filter(c => c.src === 'a.mp4')) assert.ok(c.dur <= 4);
  assert.deepEqual(starterSpec('launch', { ...ctx, clips: [] }).clips, []);
});

test('text follows the brand language and names the brand', () => {
  assert.match(starterSpec('launch', ctx).heads[0].text, /MyApp/);
  assert.match(starterSpec('launch', { ...ctx, lang: 'nl' }).heads[0].text, /Maak kennis met/);
  assert.equal(starterSpec('launch', { ...ctx, lang: 'xx' }).overline, 'Now available');
});
