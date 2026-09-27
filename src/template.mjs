// The vertical (1080x1920) motion-graphics template: headline + device with screen recordings + callout
// chips + end card. Brand (colors, logo, font, end card) and layout (which device) come from the
// workspace, so the same template serves different apps.
import { captionGroups, captionStyle } from './captions.mjs';
import { musicMix } from './audio.mjs';

export const W = 1080, H = 1920;

// Device layouts. `enter` is how the device animates in; `screen` is the CSS size of its .screen area
// (keep in sync with the .L-<name> rules below), used to place cropped/fitted clips and for the editor's fit check.
// `box` is the device area in the 1080×1920 stage (both phones for dual, incl. their name tags), used to place the
// stage in other formats; `dev` is the size of one device element (#phone), in which tap positions are given.
export const layouts = {
  phone: { label: 'Telefoon', devices: 1, enter: 'rise', screen: [616, 1334], box: [220, 572, 640, 1358], dev: [640, 1358] },
  dual: { label: 'Twee telefoons', devices: 2, enter: 'rise', screen: [616, 1334], box: [44, 584, 992, 1122], dev: [461, 978] },
  tablet: { label: 'Tablet', devices: 1, enter: 'rise', screen: [864, 1176], box: [90, 600, 900, 1212], dev: [900, 1212] },
  browser: { label: 'Browservenster (desktop)', devices: 1, enter: 'rise', screen: [1000, 636], box: [40, 690, 1000, 700], dev: [1000, 700] },
  full: { label: 'Volledig scherm (geen apparaat)', devices: 1, enter: 'fade', screen: [W, H], box: [0, 0, W, H], dev: [W, H] }
};

// Output formats. Everything is designed on the 1080×1920 stage; another format frames that stage differently:
// stacked (headline on top, device below) or side by side (headline left, device right). `area` is where the
// device box goes in the frame, `peek` how much of a tall device must be visible (the rest runs off the bottom).
export const formats = {
  '9:16': { label: '9:16 staand', w: 1080, h: 1920, suffix: '' },
  '4:5': { label: '4:5 feed', w: 1080, h: 1350, suffix: '-4x5', kind: 'stack', area: [40, 470, 1000, 880], peek: 0.8 },
  '1:1': { label: '1:1 vierkant', w: 1080, h: 1080, suffix: '-1x1', kind: 'side', area: [560, 70, 470, 1010] },
  '16:9': { label: '16:9 liggend', w: 1920, h: 1080, suffix: '-16x9', kind: 'side', area: [1010, 70, 840, 1010] }
};
export const formatOf = f => formats[f] ? f : '9:16';
// A callout's position in a format: its own override for that format (c.pos['16:9'] = { x, y }), else the 9:16 one.
export const placeIn = (c, fmt) => (formatOf(fmt) !== '9:16' && c.pos?.[formatOf(fmt)]) || c;

// Scale + offset that puts the stage's device box into the format's area (null = the stage is the frame).
export function stageFit(fmt, L) {
  const F = formats[formatOf(fmt)];
  if (!F.area) return null;
  if (L === 'full') { const s = Math.max(F.w / W, F.h / H); return { s, tx: (F.w - W * s) / 2, ty: (F.h - H * s) / 2 }; }
  const [bx, by, bw, bh] = layouts[L].box, [ax, ay, aw, ah] = F.area;
  const vis = F.peek && L !== 'browser' ? bh * F.peek : bh;
  const s = Math.min(aw / bw, ah / vis);
  const tx = ax + (aw - bw * s) / 2 - bx * s;
  const ty = ay + (F.kind === 'stack' ? 0 : Math.max(0, (ah - bh * s) / 2)) - by * s;
  return { s: +s.toFixed(4), tx: Math.round(tx), ty: Math.round(ty) };
}

export const defaultTheme = {
  bg: '#0d1015', text: '#f5f5fa', muted: '#a9adb8', accent: '#b8c7ff', accentInk: '#17244a',
  markBg: null, markInk: null, glow: '#91a9ff', glow2: '#d7baff', orbit: '#93aaff', orbit2: '#c1ec8a',
  deviceGlow: '#7f98ff', deviceRing: '#3a3f4a', endGlow: null
};
export const defaultChipColors = { blue: ['#b8c7ff', '#17244a'], violet: ['#d7baff', '#35214b'], lime: ['#c1ec8a', '#263618'], orange: ['#ffb77d', '#4a2a0c'] };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = c => { let h = String(c || '').trim(); if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map(x => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(h) ? h : '#888888'; };
const a = (c, alpha) => hex(c) + alpha;

export const layoutOf = v => layouts[v.layout] ? v.layout : v.dual ? 'dual' : 'phone';

// Fills in defaults so partially edited specs still build.
export function normalize(v) {
  const out = { overline: '', tagline: '', heads: [], clips: [], clips2: [], chips: [], zooms: [], subs: [], taps: [], ...v };
  out.heads = [...out.heads].sort((a, b) => a.t - b.t);
  out.layout = layoutOf(out);
  return out;
}

function headHtml(text, cls) {
  let accent = false;
  const spans = String(text || '').split(' ').map(raw => {
    let word = raw;
    const opens = word.startsWith('*'); if (opens) { accent = true; word = word.slice(1); }
    const closes = /\*[^\w]*$/.test(word);
    const isAccent = accent;
    word = word.replace(/\*/g, '');
    if (closes) accent = false;
    return `<span class="w${isAccent ? ' em' : ''}"><span class="wi">${esc(word)}</span></span>`;
  });
  return `<h1 class="${cls}">${spans.join(' ')}</h1>`;
}

const isImage = src => /\.(png|jpe?g|webp|gif)$/i.test(src);

// How a clip sits in a screen of W×H. fit 'cover' fills it (top-aligned, overflow cut off), 'contain' shows all of
// it with the screen background around it. A crop ({ x, y, w, h } of the source, plus its size sw/sh) is placed the
// same way, with the rest of the source clipped away.
export function clipPlacement(c, [W, H]) {
  const contain = c.fit === 'contain';
  const cr = c.crop;
  if (!cr?.w || !cr?.h || !cr.sw || !cr.sh) return { cls: contain ? ' fit-contain' : '', style: '' };
  const k = contain ? Math.min(W / cr.w, H / cr.h) : Math.max(W / cr.w, H / cr.h);
  const rw = cr.w * k, rh = cr.h * k;
  const ox = (W - rw) / 2, oy = contain ? (H - rh) / 2 : 0;
  const px = n => `${+n.toFixed(2)}px`;
  const style = `left:${px(ox - cr.x * k)};top:${px(oy - cr.y * k)};width:${px(cr.sw * k)};height:${px(cr.sh * k)};object-fit:fill;` +
    `clip-path:inset(${px(cr.y * k)} ${px((cr.sw - cr.x - cr.w) * k)} ${px((cr.sh - cr.y - cr.h) * k)} ${px(cr.x * k)})`;
  return { cls: '', style };
}

// brand = resolved brand from the workspace: { name, lang, url, logoHtml, pills, theme, chipColors, font, endNameSize, css }
export function build(v, brand, fmt = '9:16') {
  v = normalize(v);
  const DUR = v.dur ?? 15, END = v.end ?? 12.6;
  const T = { ...defaultTheme, ...(brand.theme || {}) };
  const chipColors = { ...defaultChipColors, ...(brand.chipColors || {}) };
  const L = v.layout;
  const F = formats[formatOf(fmt)], FW = F.w, FH = F.h, fit = stageFit(fmt, L);
  // Taps (tap/click markers on the first device, in its own pixels): a finger dot on touch devices, a pointer in the browser.
  const pointer = t => (t.style || (L === 'browser' ? 'cursor' : 'finger')) === 'cursor';
  const taps = v.taps.map((t, i) => `<div id="tap${i}" class="tap${pointer(t) ? ' cursor' : ''}" style="left:${Math.round(t.x)}px;top:${Math.round(t.y)}px"><i class="tap-ring"></i>${pointer(t)
    ? '<svg class="tap-cursor" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 3.1-1.4-2.9-6.5 6.3-.3z"/></svg>'
    : '<i class="tap-dot"></i>'}</div>`).join('');
  const heads = v.heads.map((h, i) => headHtml(h.text, `head${h.hook ? ' hook' : ''}`).replace('<h1 ', `<h1 id="h${i}" `)).join('\n        ');
  const place = c => { const p = clipPlacement(c, layouts[L].screen); return `class="clip screen-video${p.cls}"${p.style ? ` style="${p.style}"` : ''}`; };
  const clipTags = (list, prefix, track) => list.map((c, i) => isImage(c.src)
    ? `<img id="${v.id}-${prefix}${i}" ${place(c)} src="assets/clips/${esc(c.src)}" data-start="${c.start}" data-duration="${c.dur}" data-track-index="${track + i}" alt="" />`
    : `<video id="${v.id}-${prefix}${i}" ${place(c)} src="assets/clips/${esc(c.src)}" data-start="${c.start}" data-duration="${c.dur}" data-media-start="${c.media ?? 0}"${c.rate ? ` data-playback-rate="${c.rate}"` : ''} data-track-index="${track + i}" muted playsinline></video>`
  ).join('\n                ');
  const chrome = L === 'browser' ? `<div class="chrome"><i></i><i></i><i></i><span class="addr"><span class="ms">lock</span>${esc(brand.url || '')}</span></div>` : '';
  const phone = (id, list, prefix, track, tag) => `<div id="${id}" class="phone L-${L}">
        <div id="${id}-zoom" class="phone-zoom">
          <div id="${id}-inner" class="phone-inner">${id === 'phone' && taps ? `
            <div class="taps">${taps}</div>` : ''}
            <div class="phone-scale">
              <div class="device">${chrome}
                <div class="screen">
                ${clipTags(list, prefix, track)}
                </div>
              </div>
            </div>
          </div>
        </div>
        ${tag ? `<div class="phone-tag"><span class="tag-avatar">${esc(tag[0])}</span>${esc(tag)}</div>` : ''}
      </div>`;
  const phones = L === 'dual'
    ? phone('phone', v.clips, 'clip', 1, v.names?.[0] || 'Alex') + '\n      ' + phone('phone2', v.clips2, 'clip2-', 21, v.names?.[1] || 'Jordan')
    : phone('phone', v.clips, 'clip', 1);
  const firstLive = v.chips.find(c => c.live);
  const chips = v.chips.map((c, i) => {
    const [bg, ink] = chipColors[c.color] || chipColors.blue || Object.values(chipColors)[0];
    const at = placeIn(c, fmt);
    return `<div id="chip${i}" class="chip" style="left:${at.x}px;top:${at.y}px">
          <span class="chip-icon" style="background:${bg};color:${ink}"><span class="ms">${esc(c.icon)}</span></span>
          <span class="chip-copy"><span class="chip-label" style="color:${bg}">${c.live ? '<i class="live-dot"></i>' : ''}${esc(c.label)}</span><span class="chip-text" id="chip${i}-text">${esc(c.text)}</span></span>
        </div>`;
  }).join('\n        ');
  const mix = v.music?.src ? musicMix(v) : null;
  // Captions: one element per on-screen word group, one span per word (timed in the script).
  const cs = captionStyle(brand, v);
  cs.y = v.captions?.pos?.[formatOf(fmt)] ?? cs.y;
  const capGroups = v.captions?.off ? [] : captionGroups(v.subs, Math.max(1, cs.words | 0), END - 0.15);
  const capColor = hex(cs.color || T.text), capHi = hex(cs.hi || T.accent), capInk = hex(cs.ink || T.accentInk);
  // Other formats: the caption line keeps its relative height, the text shrinks less than the frame does.
  const capMap = FH / H, capSize = F.area ? Math.min(1, capMap * 1.25) : 1;
  const capK = Math.max(2, Math.round(cs.size * capSize * 0.055));
  const capShadow = cs.outline ? [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([x, y]) => `${Math.round(x * capK)}px ${Math.round(y * capK)}px 0 #000`).join(', ') + `, 0 ${capK}px ${capK * 4}px #000a` : 'none';
  const captions = capGroups.map((g, i) => `<div id="cap${i}" class="cap"><span class="cap-bg"><span class="cap-line">${g.words.map((w, j) => `<span id="cap${i}-${j}" class="cw${w.em ? ' em' : ''}">${esc(w.w)}</span>`).join(' ')}</span></span></div>`).join('\n        ');
  const enter = layouts[L].enter === 'fade'
    ? `tl.fromTo('.phone', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 1.0, ease: 'power2.out' }, 0.5);`
    : `tl.fromTo('.phone', { y: 900, rotation: 6, scale: 0.92 }, { y: 0, rotation: 0, scale: 1, duration: 1.0, ease: 'expo.out', stagger: 0.12 }, 0.75);`;

  const script = `
      const tl = gsap.timeline({ paused: true });
      const heads = ${JSON.stringify(v.heads.map(h => h.t))};
      const chips = ${JSON.stringify(v.chips.map(({ t, out, count, suffix }) => ({ t, out, count, suffix })))};
      const zooms = ${JSON.stringify(v.zooms)};
      const taps = ${JSON.stringify(v.taps.map(t => ({ t: t.t, cursor: pointer(t) })))};
      const END = ${END};
      const caps = ${JSON.stringify(capGroups.map(g => ({ s: g.s, e: g.e, w: g.words.map(w => w.t), em: g.words.map(w => !!w.em) })))};
      const CAP = ${JSON.stringify({ style: cs.style, color: capColor, hi: capHi, ink: capInk, shadow: capShadow })};
      const locale = ${JSON.stringify(brand.lang === 'nl' ? 'nl-NL' : 'en-US')};

      // Background: slow orbit drift + glow breathing.
      tl.fromTo('#orbit', { rotation: -8, x: 0 }, { rotation: 14, x: -60, duration: ${DUR}, ease: 'none' }, 0);
      tl.fromTo('#orbit2', { rotation: 10, y: 0 }, { rotation: -12, y: 80, duration: ${DUR}, ease: 'none' }, 0);
      tl.fromTo('#glow', { opacity: 0.55, scale: 1 }, { opacity: 0.9, scale: 1.15, duration: ${DUR}, ease: 'sine.inOut' }, 0);

      // Overline.
      tl.fromTo('#overline', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.1);

      // Headlines: word-by-word rise in, lift out when the next arrives.
      heads.forEach((t, i) => {
        const inner = '#h' + i + ' .wi';
        tl.set('#h' + i, { opacity: 1 }, t);
        tl.fromTo(inner, { yPercent: 110, rotation: 4 }, { yPercent: 0, rotation: 0, duration: 0.55, ease: 'power4.out', stagger: 0.06 }, t + (i === 0 ? 0.15 : 0));
        const next = i + 1 < heads.length ? heads[i + 1] : END;
        tl.to(inner, { yPercent: -110, duration: 0.35, ease: 'power3.in', stagger: 0.025 }, next - 0.32);
        tl.set('#h' + i, { opacity: 0 }, next + 0.02);
      });

      // Device enters, then breathes.
      ${enter}
      tl.fromTo('.phone-inner', { y: 0 }, { y: -18, duration: END - 1.8, ease: 'sine.inOut', stagger: 0.4 }, 1.8);
      // Zooms. With a focus point (fx, fy in frame pixels) the device shifts so that point lands mid-screen,
      // clamped so the zoomed device still covers the area it covered before; otherwise only the manual y shift.
      const dev = document.getElementById('phone');
      const focus = z => {
        if (z.fx == null || z.fy == null) return [0, z.y || 0];
        const L = dev.offsetLeft, T = dev.offsetTop, W = dev.offsetWidth, H = dev.offsetHeight, s = z.scale;
        const ox = L + W * 0.5, oy = T + H * 0.7;
        const clamp = (d, lo, hi, o) => { const a = hi - (o + s * (hi - o)), b = lo - (o + s * (lo - o)); return Math.min(Math.max(d, Math.min(a, b)), Math.max(a, b)); };
        return [Math.round(clamp(540 - ox - s * (z.fx - ox), L, L + W, ox)), Math.round(clamp(1250 - oy - s * (z.fy - oy), T, T + H, oy))];
      };
      zooms.forEach(z => {
        const [x, y] = focus(z);
        tl.to('.phone-zoom', { scale: z.scale, x, y, duration: z.dur, ease: 'power3.inOut' }, z.t);
        tl.to('#top-fade', { opacity: 1, duration: z.dur, ease: 'power2.inOut' }, z.t);
        if (z.out) { tl.to('.phone-zoom', { scale: 1, x: 0, y: 0, duration: 0.7, ease: 'power3.inOut' }, z.out); tl.to('#top-fade', { opacity: 0, duration: 0.7 }, z.out); }
        else tl.to('#top-fade', { opacity: 0, duration: 0.3 }, END - 0.3);
      });

      // Taps: the finger/pointer arrives, presses, a ring spreads out, then it lifts away.
      taps.forEach((p, i) => {
        const id = '#tap' + i, hand = id + (p.cursor ? ' .tap-cursor' : ' .tap-dot');
        if (p.cursor) tl.fromTo(hand, { opacity: 0, x: 70, y: 90 }, { opacity: 1, x: 0, y: 0, duration: 0.4, ease: 'power3.out', immediateRender: false }, p.t - 0.45);
        else tl.fromTo(hand, { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power2.out', immediateRender: false }, p.t - 0.22);
        tl.to(hand, { scale: 0.82, duration: 0.09, ease: 'power2.in' }, p.t);
        tl.to(hand, { scale: 1, duration: 0.18, ease: 'back.out(3)' }, p.t + 0.09);
        tl.fromTo(id + ' .tap-ring', { opacity: 0.95, scale: 0.5 }, { opacity: 0, scale: 2.8, duration: 0.6, ease: 'power2.out', immediateRender: false }, p.t);
        tl.to(hand, { opacity: 0, duration: 0.25, ease: 'power1.in' }, p.t + (p.cursor ? 0.7 : 0.45));
      });

      // Callout chips pop in and out.
      chips.forEach((c, i) => {
        const id = '#chip' + i;
        tl.fromTo(id, { opacity: 0, scale: 0.6, x: -40 }, { opacity: 1, scale: 1, x: 0, duration: 0.55, ease: 'back.out(1.8)' }, c.t);
        tl.fromTo(id + ' .chip-icon', { rotation: -30 }, { rotation: 0, duration: 0.6, ease: 'back.out(3)' }, c.t + 0.08);
        tl.to(id, { opacity: 0, scale: 0.85, y: -20, duration: 0.3, ease: 'power2.in' }, c.out);
        if (c.count) {
          const counter = { v: 0 };
          const el = document.getElementById('chip' + i + '-text');
          tl.fromTo(counter, { v: 0 }, { v: c.count, duration: 1.4, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(counter.v).toLocaleString(locale) + (c.suffix || ''); } }, c.t + 0.1);
        }
      });
      if (document.querySelector('.live-dot')) tl.fromTo('.live-dot', { opacity: 1 }, { opacity: 0.25, duration: 0.45, repeat: 5, yoyo: true, ease: 'sine.inOut' }, ${firstLive ? firstLive.t + 0.1 : 2.8});

      // Captions: a group is visible for its window; inside it each word lights up when it is spoken.
      caps.forEach((g, i) => {
        tl.set('#cap' + i, { opacity: 1 }, g.s);
        tl.set('#cap' + i, { opacity: 0 }, g.e);
        if (CAP.style === 'plain') { tl.fromTo('#cap' + i + ' .cap-bg', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out', immediateRender: false }, g.s); return; }
        g.w.forEach((t, j) => {
          const w = document.getElementById('cap' + i + '-' + j);
          const next = j + 1 < g.w.length ? g.w[j + 1] : g.e;
          const base = g.em[j] ? CAP.hi : CAP.color;
          if (CAP.style === 'pop') {
            tl.fromTo(w, { opacity: 0, scale: 0.5, y: 18 }, { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'back.out(2.6)', immediateRender: false }, t);
            tl.set(w, { color: CAP.hi }, t); tl.set(w, { color: base }, next);
          } else if (CAP.style === 'karaoke') {
            tl.set(w, { opacity: 1, color: CAP.hi }, t); tl.set(w, { color: base }, next);
          } else if (CAP.style === 'box') {
            tl.set(w, { backgroundColor: CAP.hi, color: CAP.ink, textShadow: 'none', scale: 1.08 }, t);
            tl.set(w, { backgroundColor: 'rgba(0,0,0,0)', color: base, textShadow: CAP.shadow, scale: 1 }, next);
          }
        });
      });

      // End card.
      tl.to('#overline', { opacity: 0, y: -16, duration: 0.3, ease: 'power2.in' }, END - 0.2);
      tl.to('.phone', { y: 420, scale: 0.8, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.06 }, END - 0.3);
      tl.fromTo('#endcard', { opacity: 0 }, { opacity: 1, duration: 0.3 }, END);
      tl.fromTo('#end-logo', { scale: 0.2, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.6)' }, END + 0.05);
      tl.fromTo('#end-ring', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.2, ease: 'expo.out' }, END + 0.1);
      tl.fromTo('#end-name', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power4.out' }, END + 0.3);
      tl.fromTo('#end-tag .wi', { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power4.out', stagger: 0.05 }, END + 0.5);
      tl.fromTo('#end-pills .pill', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(2)', stagger: 0.08 }, END + 0.8);
      tl.fromTo('#end-url', { opacity: 0 }, { opacity: 1, duration: 0.4 }, END + 1.1);

      window.__timelines['${v.id}'] = tl;`;

  const endName = brand.endNameSize || 140;
  const font = brand.font || 'google-sans-flex-latin.woff2';
  const pills = (brand.pills || []).filter(p => p && p[1]);

  return `<!doctype html>
<html lang="${esc(brand.lang || 'en')}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${FW}, height=${FH}" />
    <title>${esc(brand.name)} — ${esc(v.overline)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Brand'; src: url('assets/fonts/${esc(font)}'); font-weight: 100 900; font-style: normal; }
      @font-face { font-family: 'Material Symbols Rounded'; src: url('assets/fonts/material-symbols.woff2') format('woff2'); font-weight: 600; font-style: normal; }
      :root { --bg: ${hex(T.bg)}; --text: ${hex(T.text)}; --muted: ${hex(T.muted)}; --accent: ${hex(T.accent)}; --accent-ink: ${hex(T.accentInk)}; --mark-bg: ${hex(T.markBg || T.accent)}; --mark-ink: ${hex(T.markInk || T.accentInk)}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${FW}px; height: ${FH}px; overflow: hidden; background: var(--bg); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: 'Brand', 'Google Sans Flex', system-ui, sans-serif; }
      .ms { font-family: 'Material Symbols Rounded'; font-weight: 600; font-size: 44px; line-height: 1; display: block; letter-spacing: normal; }

      /* background */
      #glow { position: absolute; width: 1400px; height: 1400px; right: -620px; top: -560px; border-radius: 50%; background: radial-gradient(circle, ${a(T.glow, '40')} 0%, ${a(T.glow, '10')} 40%, transparent 68%); }
      #glow2 { position: absolute; width: 1200px; height: 1200px; left: -700px; bottom: -380px; border-radius: 50%; background: radial-gradient(circle, ${a(T.glow2, '22')} 0%, transparent 65%); }
      #orbit { position: absolute; width: 1100px; height: 1100px; right: -640px; top: 620px; border: 110px solid ${a(T.orbit, '14')}; border-radius: 50%; }
      #orbit2 { position: absolute; width: 700px; height: 700px; left: -420px; top: 260px; border: 70px solid ${a(T.orbit2, '0d')}; border-radius: 50%; }
      #grain { position: absolute; inset: 0; background-image: radial-gradient(#ffffff08 1px, transparent 1px); background-size: 6px 6px; opacity: .5; }

      /* headline block */
      #top-fade { position: absolute; left: 0; right: 0; top: 0; height: 720px; background: linear-gradient(var(--bg) 0%, var(--bg) 62%, ${a(T.bg, '00')} 100%); opacity: 0; z-index: 15; }
      #top { z-index: 20; position: absolute; left: 70px; right: 70px; top: 150px; height: 400px; }
      #overline { display: flex; align-items: center; gap: 14px; color: var(--accent); font-size: 26px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; }
      #overline .mark { width: 44px; height: 44px; border-radius: 14px 10px 14px 10px; background: var(--mark-bg); color: var(--mark-ink); display: grid; place-items: center; overflow: hidden; }
      #overline .mark svg, #overline .mark img { width: 30px; height: 30px; display: block; object-fit: contain; }
      .head { position: absolute; left: 0; right: 0; top: 70px; font-size: 92px; line-height: 0.98; font-weight: 780; letter-spacing: -3.5px; opacity: 0; text-wrap: balance; }
      .head.hook { font-size: 104px; letter-spacing: -4px; }
      .w { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: 10px; margin-bottom: -10px; }
      .wi { display: inline-block; }
      .em .wi { color: var(--accent); }

      /* device: shared */
      .phone { position: absolute; }
      .phone-zoom, .phone-inner { position: absolute; inset: 0; transform-origin: 50% 70%; }
      .phone-scale { position: absolute; inset: 0; }
      .device { position: absolute; inset: 0; background: #1a1d24; display: flex; flex-direction: column; box-shadow: 0 0 0 2px ${hex(T.deviceRing)}, 0 60px 120px #000a, 0 0 140px ${a(T.deviceGlow, '26')}; }
      .screen { position: relative; flex: 1; overflow: hidden; background: var(--bg); }
      .screen-video { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }
      .screen-video.fit-contain { object-fit: contain; object-position: 50% 50%; }

      /* layout: phone */
      .L-phone { left: 220px; top: 572px; width: 640px; height: 1358px; }
      .L-phone .device, .L-dual .device { border-radius: 76px; padding: 12px; }
      .L-phone .screen, .L-dual .screen { border-radius: 64px; }
      /* layout: two phones */
      .L-dual { width: 461px; height: 978px; }
      .L-dual .phone-scale { width: 640px; height: 1358px; transform-origin: 0 0; transform: rotate(-2deg) scale(0.72); }
      #phone.L-dual { left: 44px; top: 668px; }
      #phone2.L-dual { left: 575px; top: 728px; }
      #phone2.L-dual .phone-scale { transform: rotate(2deg) scale(0.72); }
      .phone-tag { position: absolute; left: 50%; top: -84px; transform: translateX(-50%); z-index: 2; display: flex; align-items: center; gap: 12px; padding: 8px 24px 8px 8px; border-radius: 30px; background: #22262d; border: 2px solid #343945; font-size: 28px; font-weight: 750; white-space: nowrap; }
      .tag-avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 22px; font-weight: 800; background: var(--accent); color: var(--accent-ink); }
      /* layout: tablet */
      .L-tablet { left: 90px; top: 600px; width: 900px; height: 1212px; }
      .L-tablet .device { border-radius: 58px; padding: 18px; }
      .L-tablet .screen { border-radius: 40px; }
      /* layout: desktop browser window */
      .L-browser { left: 40px; top: 690px; width: 1000px; height: 700px; }
      .L-browser .device { border-radius: 24px; overflow: hidden; background: #1c2028; }
      .L-browser .chrome { height: 64px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: #23272f; border-bottom: 2px solid #2e333d; }
      .L-browser .chrome i { width: 16px; height: 16px; border-radius: 50%; background: #3b404b; }
      .L-browser .addr { margin-left: 18px; flex: 1; height: 38px; border-radius: 19px; background: #15181e; color: var(--muted); font-size: 22px; font-weight: 600; display: flex; align-items: center; gap: 8px; padding: 0 18px; }
      .L-browser .addr .ms { font-size: 22px; }
      .L-browser .screen { border-radius: 0; }
      /* layout: full screen footage */
      .L-full { left: 0; top: 0; width: ${W}px; height: ${H}px; }
      .L-full .device { background: none; box-shadow: none; }
      .L-full .screen { background: none; }
      .L-full::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(${a(T.bg, 'f0')} 0%, ${a(T.bg, 'b0')} 22%, ${a(T.bg, '00')} 42%, ${a(T.bg, '00')} 70%, ${a(T.bg, '99')} 100%); }

      /* stage: the 1080×1920 design space; other formats scale and move it (see stageFit) */
      #stage { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; }
      /* formats */
      .F-stack #top { top: 100px; height: 340px; }
      .F-stack .head { top: 62px; font-size: 80px; letter-spacing: -3px; }
      .F-stack .head.hook { font-size: 90px; }
      .F-stack #top-fade { height: 520px; }
      .F-side #top-fade { display: none; }
      .F-side #top { left: ${Math.round(FW * 0.075)}px; right: auto; width: ${F.area ? F.area[0] - Math.round(FW * 0.075) - 50 : 0}px; top: ${Math.round(FH * 0.24)}px; height: ${Math.round(FH * 0.6)}px; }
      .F-side #captions { left: ${Math.round(FW * 0.075)}px; right: auto; width: ${F.area ? F.area[0] - Math.round(FW * 0.075) - 50 : 0}px; }
      .F-side .head { font-size: ${FW > 1500 ? 96 : 66}px; letter-spacing: -2.5px; }
      .F-side .head.hook { font-size: ${FW > 1500 ? 108 : 74}px; }
      .F-side #overline { font-size: ${FW > 1500 ? 26 : 22}px; }
      ${F.area ? `#endcard { transform: scale(${Math.min(1, FH / 1500).toFixed(3)}); }` : ''}

      /* taps: a 0×0 anchor at the tapped point; everything inside is centered on it */
      .taps { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
      .tap { position: absolute; width: 0; height: 0; }
      .tap-dot, .tap-ring { position: absolute; left: -36px; top: -36px; width: 72px; height: 72px; border-radius: 50%; opacity: 0; }
      .tap-dot { background: #ffffffd9; box-shadow: 0 0 0 7px #ffffff45, 0 12px 30px #0007; }
      .tap-ring { border: 6px solid var(--accent); }
      .tap-cursor { position: absolute; left: -7px; top: -4px; width: 64px; height: 64px; opacity: 0; transform-origin: 7px 4px; filter: drop-shadow(0 6px 10px #0009); }
      .tap-cursor path { fill: #fff; stroke: #111; stroke-width: 1.3; stroke-linejoin: round; }

      /* chips */
      .chip { position: absolute; display: flex; align-items: center; gap: 22px; padding: 20px 34px 20px 20px; border-radius: 40px; background: #181b20f2; border: 2px solid #343945; box-shadow: 0 30px 60px #000b; opacity: 0; transform-origin: 0% 50%; z-index: 10; }
      .chip-icon { width: 84px; height: 84px; border-radius: 26px; display: grid; place-items: center; flex: none; }
      .chip-copy { display: flex; flex-direction: column; gap: 6px; }
      .chip-label { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; }
      .chip-text { font-size: 42px; font-weight: 750; letter-spacing: -1px; white-space: nowrap; }
      .live-dot { display: block; width: 14px; height: 14px; border-radius: 50%; background: ${hex(chipColors.lime?.[0] || T.accent)}; }

      /* captions: #captions sits on the chosen line, each group is centered on it */
      #captions { position: absolute; left: 70px; right: 70px; top: ${Math.round(cs.y * capMap)}px; height: 0; z-index: 12; }
      .cap { position: absolute; left: 0; right: 0; top: 0; height: 0; display: flex; align-items: center; justify-content: center; opacity: 0; }
      .cap-bg { display: block; max-width: 100%; text-align: center; font-size: ${Math.round(cs.size * capSize)}px; font-weight: 820; line-height: 1.14; letter-spacing: -0.02em; color: ${capColor}; text-wrap: balance;${cs.upper ? ' text-transform: uppercase;' : ''} }
      .cw { display: inline-block; padding: 0.02em 0.14em; margin: 0 -0.06em; border-radius: 0.2em; text-shadow: ${capShadow}; }
      .cw.em { color: ${capHi}; }
      .S-pop .cw { opacity: 0; }
      .S-karaoke .cw { opacity: 0.45; }
      .S-plain .cap-bg { line-height: 1.42; }
      .S-plain .cap-line { background: #000000b8; padding: 0.1em 0.4em; border-radius: 0.25em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
      .S-plain .cw { text-shadow: none; }

      /* end card */
      #endcard { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding-bottom: 180px; opacity: 0; }
      #end-mark { position: relative; width: 230px; height: 230px; display: grid; place-items: center; }
      #end-ring { position: absolute; inset: -70px; border-radius: 50%; border: 34px solid ${a(T.orbit, '1f')}; }
      #end-logo { width: 230px; height: 230px; border-radius: 72px 50px 72px 50px; background: var(--mark-bg); color: var(--mark-ink); display: grid; place-items: center; overflow: hidden; box-shadow: 0 0 120px ${a(T.endGlow || T.accent, '55')}; }
      #end-logo svg, #end-logo img { width: 150px; height: 150px; display: block; object-fit: contain; }
      #end-name { font-size: ${endName}px; font-weight: 800; letter-spacing: ${-Math.round(endName / 24)}px; line-height: 1; margin-top: 30px; }
      #end-tag { font-size: 64px; font-weight: 700; letter-spacing: -2px; color: #e9eaf2; text-align: center; max-width: 900px; }
      #end-pills { display: flex; gap: 18px; margin-top: 10px; }
      .pill { display: flex; align-items: center; gap: 12px; padding: 18px 30px; border-radius: 40px; font-size: 34px; font-weight: 750; }
      .pill .ms { font-size: 38px; }
      .pill.a { background: var(--accent); color: var(--accent-ink); }
      .pill.b { background: #22262d; color: var(--text); border: 2px solid #343945; }
      #end-url { font-size: 34px; font-weight: 650; color: var(--muted); letter-spacing: 1px; }
      ${brand.css || ''}
    </style>
  </head>
  <body>
    <div id="root" class="F-${F.kind || 'tall'}" data-composition-id="${v.id}" data-start="0" data-width="${FW}" data-height="${FH}" data-duration="${DUR}" data-fps="30">
      <div id="glow"></div>
      <div id="glow2"></div>
      <div id="orbit"></div>
      <div id="orbit2"></div>
      <div id="grain"></div>

      <div id="stage" data-scale="${fit?.s ?? 1}"${fit ? ` style="transform:translate(${fit.tx}px,${fit.ty}px) scale(${fit.s})"` : ''}>
      ${phones}

      ${chips}
      </div>

      <div id="top-fade"></div>
      <div id="top">
        <div id="overline"><span class="mark">${brand.logoHtml || ''}</span>${esc(brand.name)}${v.overline ? ` · ${esc(v.overline)}` : ''}</div>
        ${heads}
      </div>

      <div id="captions" data-scale="${capMap}" class="S-${esc(cs.style)}">
        ${captions}
      </div>
${v.audio ? `      <audio id="vo" src="assets/vo/${esc(v.audio)}" data-start="0" data-duration="${DUR}"${v.audioVol != null && v.audioVol !== 1 ? ` data-volume="${Math.max(0, Math.min(1, +v.audioVol))}"` : ''} data-track-index="40"></audio>
` : ''}${mix ? `      <audio id="music" src="assets/vo/${esc(mix.src)}" data-start="${mix.start}" data-duration="${mix.dur}" data-media-start="${mix.media}" ${mix.fx ? `data-fx-chain="${esc(JSON.stringify(mix.fx.chain))}" ` : ''}data-automation="${esc(JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: mix.points }, ...(mix.fx?.lanes || [])] }))}" data-track-index="41"></audio>
` : ''}
      <div id="endcard">
        <div id="end-mark"><div id="end-ring"></div><div id="end-logo">${brand.logoHtml || ''}</div></div>
        <div id="end-name">${esc(brand.name)}</div>
        ${headHtml(v.tagline, '').replace('<h1 class="">', '<div id="end-tag">').replace('</h1>', '</div>')}
        ${pills.length ? `<div id="end-pills">${pills.map(([icon, label], i) => `<span class="pill ${i ? 'b' : 'a'}">${icon ? `<span class="ms">${esc(icon)}</span>` : ''}${esc(label)}</span>`).join('')}</div>` : ''}
        ${brand.url ? `<div id="end-url">${esc(brand.url)}</div>` : ''}
      </div>
    </div>
    <script>${script}
    </script>
  </body>
</html>
`;
}
