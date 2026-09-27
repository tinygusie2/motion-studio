import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, layouts, formats, stageFit, clipPlacement, placeIn, W, H } from '../src/template.mjs';

const brand = { name: 'MyApp', lang: 'en', theme: {} };
const video = extra => ({
  id: 'demo', dur: 8, end: 6,
  heads: [{ t: 0, text: 'Hello *world*', hook: true }],
  clips: [{ src: 'screen.png', start: 0.5, dur: 5 }],
  chips: [{ t: 1, out: 3, icon: 'bolt', color: 'lime', label: 'Fast', text: '10 s', x: 70, y: 1420 }],
  zooms: [{ t: 2, scale: 1.3, dur: 0.8, out: 4, fx: 540, fy: 1000 }],
  taps: [{ t: 2.5, x: 300, y: 600 }],
  subs: [{ t: 0.5, out: 2.5, text: 'Captions *work*' }],
  ...extra
});

test('build: every layout in every format gives a page of the right size', () => {
  for (const layout of Object.keys(layouts)) for (const [fmt, f] of Object.entries(formats)) {
    const html = build(video({ layout }), brand, fmt);
    assert.match(html, new RegExp(`data-width="${f.w}" data-height="${f.h}"`), `${layout} ${fmt}`);
    assert.match(html, /window\.__timelines\['demo'\] = tl;/);
    assert.match(html, /id="tap0"/);
  }
});

test('stageFit: 9:16 is the stage itself; other formats put the device box inside their area', () => {
  for (const L of Object.keys(layouts)) assert.equal(stageFit('9:16', L), null);
  for (const [fmt, F] of Object.entries(formats)) {
    if (!F.area) continue;
    for (const L of Object.keys(layouts).filter(l => l !== 'full')) {
      const { s, tx } = stageFit(fmt, L), [bx, , bw] = layouts[L].box, [ax, , aw] = F.area;
      assert.ok(tx + bx * s >= ax - 1 && tx + (bx + bw) * s <= ax + aw + 1, `${L} in ${fmt} fits horizontally`);
    }
    const full = stageFit(fmt, 'full');
    assert.ok(W * full.s >= F.w - 1 && H * full.s >= F.h - 1, `full screen covers ${fmt}`);
  }
});

test('clipPlacement: fit and crop', () => {
  assert.deepEqual(clipPlacement({}, [1000, 636]), { cls: '', style: '' });
  assert.equal(clipPlacement({ fit: 'contain' }, [1000, 636]).cls, ' fit-contain');
  const { style } = clipPlacement({ crop: { x: 100, y: 50, w: 800, h: 600, sw: 1000, sh: 800 } }, [1000, 636]);
  assert.match(style, /left:-125px;top:-62.5px;width:1250px;height:1000px/);
  assert.match(style, /clip-path:inset\(62.5px 125px 187.5px 125px\)/);
});

test('per-format positions: callouts and captions', () => {
  const c = { x: 70, y: 1420, pos: { '16:9': { x: 300, y: 900 } } };
  assert.equal(placeIn(c, '9:16'), c);
  assert.deepEqual(placeIn(c, '16:9'), { x: 300, y: 900 });
  assert.equal(placeIn(c, '4:5'), c);
  const v = video({ chips: [{ ...video().chips[0], pos: { '16:9': { x: 300, y: 900 } } }], captions: { pos: { '16:9': 1200 } } });
  assert.match(build(v, brand, '16:9'), /id="chip0" class="chip" style="left:300px;top:900px"/);
  assert.match(build(v, brand, '9:16'), /id="chip0" class="chip" style="left:70px;top:1420px"/);
  assert.match(build(v, brand, '16:9'), /#captions \{[^}]*top: 675px/);
});

test('music: carve chain and lanes end up on the bed', () => {
  const html = build(video({ audio: 'vo.wav', vo: { lines: [{ t: 1, text: 'hi', len: 2 }] }, music: { src: 'bed.wav', carve: 0.5 } }), brand);
  assert.match(html, /<audio id="music"[^>]*data-fx-chain="[^"]*peaking/);
  assert.match(html, /fx\.carve2\.gain/);
});
