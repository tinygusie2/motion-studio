import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bgTimeline } from '../src/backgrounds.mjs';
import { build, layouts, formats, stageFit, clipPlacement, placeIn, clipTransitions, transitions, W, H, deviceOf, sceneTimeline } from '../src/template.mjs';

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
    for (const L of Object.keys(layouts).filter(l => l !== 'full' && l !== 'text')) {
      const { s, tx } = stageFit(fmt, L), [bx, , bw] = layouts[L].box, [ax, , aw] = F.area;
      assert.ok(tx + bx * s >= ax - 1 && tx + (bx + bw) * s <= ax + aw + 1, `${L} in ${fmt} fits horizontally`);
    }
    for (const L of ['full', 'text']) {
      const cover = stageFit(fmt, L);
      assert.ok(W * cover.s >= F.w - 1 && H * cover.s >= F.h - 1, `${L} covers ${fmt}`);
    }
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

test('clipTransitions: the clip before a transition is held for the overlap, the incoming one stacks on top', () => {
  const list = [{ start: 3, dur: 2, tr: 'slide' }, { start: 0.5, dur: 2.5 }, { start: 6, dur: 1, tr: 'fade', trDur: 0.3 }, { start: 5, dur: 1 }];
  const { hold, z, trs } = clipTransitions(list);
  assert.deepEqual(z, [2, 1, 4, 3]);
  assert.deepEqual(hold, [0, transitions.slide.dur, 0, 0.3]);
  assert.deepEqual(trs, [{ to: 0, from: 1, t: 3, d: transitions.slide.dur, type: 'slide' }, { to: 2, from: 3, t: 6, d: 0.3, type: 'fade' }]);
  // After a gap there is nothing to hand over from: the clip only animates in. Unknown types are a hard cut.
  assert.deepEqual(clipTransitions([{ start: 0, dur: 1 }, { start: 2, dur: 1, tr: 'whip' }]).trs[0].from, -1);
  assert.equal(clipTransitions([{ start: 0, dur: 1 }, { start: 1, dur: 1, tr: 'nope' }]).trs.length, 0);
});

test('build: transitions extend the outgoing clip and animate both', () => {
  const clips = [{ src: 'a.png', start: 0.5, dur: 2 }, { src: 'b.mp4', start: 2.5, dur: 3, tr: 'whip' }];
  const html = build(video({ clips }), brand);
  assert.match(html, /id="demo-clip0"[^>]*style="z-index:1"[^>]*data-duration="2.3"/);
  assert.match(html, /id="demo-clip1"[^>]*style="z-index:2"[^>]*data-duration="3"/);
  assert.match(html, /const clipTrs = \[\{"to":"demo-clip1","from":"demo-clip0","t":2.5,"d":0.3,"type":"whip"\}\]/);
  // Without transitions the clips are written as before.
  assert.doesNotMatch(build(video(), brand), /z-index:1"/);
  // The second phone's clips only count in the dual layout.
  assert.match(build(video({ clips2: clips }), brand), /const clipTrs = \[\];/);
  assert.match(build(video({ layout: 'dual', clips2: clips }), brand), /"to":"demo-clip2-1","from":"demo-clip2-0"/);
});

test('build: keyframes animate a clip after its transition, and every transition type builds', () => {
  const kf = [{ t: 0, s: 1 }, { t: 1, s: 1.4, x: 40, ease: 'power3.out' }];
  const html = build(video({ clips: [{ src: 'a.png', start: 0.5, dur: 3, kf }] }), brand);
  assert.match(html, /const clipKfs = \[\{"id":"demo-clip0","set":\{[^}]*\},"setAt":0.5,"segs":\[\{"t":0.5,"d":1,/);
  // With a transition the keyframes start once it is over.
  const withTr = build(video({ clips: [{ src: 'a.png', start: 0.5, dur: 1 }, { src: 'b.png', start: 1.5, dur: 3, tr: 'fade', kf }] }), brand);
  assert.match(withTr, /"id":"demo-clip1","set":\{[^}]*\},"setAt":2,/);
  assert.match(build(video(), brand), /const clipKfs = \[\];/);
  for (const tr of Object.keys(transitions)) {
    const h = build(video({ clips: [{ src: 'a.png', start: 0.5, dur: 1 }, { src: 'b.png', start: 1.5, dur: 3, tr }] }), brand);
    assert.match(h, new RegExp(`"type":"${tr}"`));
    assert.match(h, new RegExp(`c.type === '${tr}'`));
  }
});

test('text layout: no device shown, headlines centered, sized to the format', () => {
  for (const fmt of Object.keys(formats)) {
    const html = build(video({ layout: 'text' }), brand, fmt);
    assert.match(html, /class="F-[a-z]+ is-text"/, fmt);
    assert.ok(html.includes('.L-text { display: none; }'), fmt);
    assert.match(html, /#root\.is-text \.head \{ top: 50%; transform: translateY\(-50%\); text-align: center; font-size: \d+px/, fmt);
    assert.ok(!html.includes("tl.fromTo('.phone', { y: 900"), 'the device does not fly in');
  }
  assert.ok(!build(video({ layout: 'phone' }), brand, '9:16').includes(' is-text"'));
});

test('headline effects: default rise and lift, per-headline choices, and an unknown one falls back', () => {
  const base = build(video(), brand, '9:16');
  assert.ok(base.includes('"in":"rise","out":"lift"'));
  assert.ok(!base.includes('class="head hook open"'), 'the mask stays on for the default');
  const heads = [{ t: 0, text: 'One', fxIn: 'pop', fxOut: 'blur' }, { t: 2, text: 'Two', fxIn: 'nonsense', fxOut: 'shrink' }];
  const html = build(video({ heads }), brand, '9:16');
  assert.ok(html.includes('"list":[{"in":"pop","out":"blur"},{"in":"rise","out":"shrink"}]'));
  assert.ok(html.includes('class="head open"'), 'scale and blur need the mask off');
  assert.ok(html.includes('"pop":{"from":{"scale":0.4,"opacity":0}'));
  assert.ok(!html.includes('"drop"'), 'only the effects in use are sent');
});

test('backgrounds: the video starts with its own style, changes crossfade, unknown styles fall back', () => {
  assert.deepEqual(bgTimeline({}), [{ t: 0, style: 'orbit' }]);
  assert.deepEqual(bgTimeline({ bg: 'nonsense' }), [{ t: 0, style: 'orbit' }]);
  const tl = bgTimeline({ bg: 'blur', bgs: [{ t: 6, style: 'grid' }, { t: 3, style: 'blur' }, { t: 4, style: 'aurora' }, { t: 0, style: 'solid' }] });
  assert.deepEqual(tl, [{ t: 0, style: 'blur' }, { t: 4, style: 'aurora' }, { t: 6, style: 'grid' }], 'sorted, no change to what already shows, none at 0');
  const html = build(video({ bg: 'blur', bgs: [{ t: 4, style: 'grid' }] }), brand, '9:16');
  assert.ok(html.includes('id="bgl-blur" class="bgl" style="opacity:1"'));
  assert.ok(html.includes('id="bgl-grid" class="bgl" style="opacity:0"'));
  assert.ok(html.includes('id="bgl-orbit" class="bgl" style="opacity:0"'));
  assert.ok(html.includes("tl.fromTo('#bgl-grid', { opacity: 0 }"), 'fades in');
  assert.ok(html.includes("tl.to('#bgl-blur', { opacity: 0"), 'fades out');
  assert.ok(!html.includes('id="bgl-aurora"'), 'only the styles in use are in the page');
  assert.ok(build(video(), brand, '9:16').includes('id="bgl-orbit" class="bgl" style="opacity:1"'));
});

test('layout changes: a video can open with only text and switch to its device', () => {
  const v = video({ layout: 'text', lays: [{ t: 3, layout: 'phone' }, { t: 8, layout: 'text' }, { t: 9, layout: 'text' }] });
  assert.equal(deviceOf(v), 'phone');
  assert.deepEqual(sceneTimeline(v), [{ t: 0, text: true }, { t: 3, text: false, tr: 'fade', d: 0.8 }, { t: 8, text: true, tr: 'fade', d: 0.8 }]);
  const html = build(v, brand, '9:16');
  assert.ok(html.includes('class="F-tall is-text"'), 'starts as text');
  assert.ok(html.includes('class="phone L-phone"'), 'the device is in the page');
  assert.ok(html.includes("tl.set('#root', { attr: { class: 'F-tall' } }, 3);"));
  assert.ok(html.includes("tl.set('#root', { attr: { class: 'F-tall is-text' } }, 8);"));
  assert.equal(deviceOf(video({ layout: 'tablet', lays: [{ t: 2, layout: 'text' }] })), 'tablet');
  assert.ok(!build(video({ layout: 'phone' }), brand).includes("attr: { class"), 'no changes, no scene script');
  assert.ok(html.includes("tl.fromTo('.phone', {\"opacity\":0}"), 'the device fades in (the default)');
  assert.ok(html.includes("tl.to('#top', { opacity: 0"), 'the headlines fade around the switch');
  const slow = build(video({ layout: 'text', lays: [{ t: 3, layout: 'phone', tr: 'rise', trDur: 1.6 }] }), brand);
  assert.ok(slow.includes('{"opacity":0,"y":760}') && slow.includes('duration: 1.6'), 'own transition and length');
  const cut = build(video({ layout: 'text', lays: [{ t: 3, layout: 'phone', tr: 'cut' }] }), brand);
  assert.ok(cut.includes("tl.set('.phone', { opacity: 1 }, 3);") && !cut.includes("tl.to('#top'"), 'a cut switches at once');
});
