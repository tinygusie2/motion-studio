// Background scenery. `v.bg` is the style the video starts with, `v.bgs` = [{ t, style }] changes it during the video
// (a crossfade). Each style is a layer behind everything; the page only gets the layers a video uses.
// Shared by the template (markup, css, timeline) and the editor (labels).
export const bgStyles = {
  orbit: { label: 'Ringen', icon: 'radio_button_unchecked' },
  blur: { label: 'Wazige kleuren', icon: 'blur_on' },
  aurora: { label: 'Aurora', icon: 'auto_awesome' },
  grid: { label: 'Raster', icon: 'grid_on' },
  gradient: { label: 'Kleurverloop', icon: 'gradient' },
  spotlight: { label: 'Spotlight', icon: 'highlight' },
  solid: { label: 'Effen', icon: 'square' }
};
export const bgDefault = 'orbit';
export const bgOf = s => (bgStyles[s] ? s : bgDefault);
export const bgFade = 0.9;

// The changes in order: [{ t, style }] starting at 0 with the video's own style; a change to the style already showing is dropped.
export function bgTimeline(v) {
  const list = [{ t: 0, style: bgOf(v.bg) }];
  for (const c of [...(v.bgs || [])].filter(c => c && +c.t > 0).sort((a, b) => a.t - b.t)) {
    if (bgOf(c.style) !== list.at(-1).style) list.push({ t: +c.t, style: bgOf(c.style) });
  }
  return list;
}

const hex = c => { let h = String(c || '').trim(); if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map(x => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(h) ? h : '#888888'; };
const al = (c, alpha) => hex(c) + alpha;

// Layers of the styles in use. Orbit is written by the template itself (its elements have ids the timeline knows), so it is
// listed here only for the fades.
export function bgMarkup(timeline) {
  const used = new Set(timeline.map(x => x.style));
  const layer = (style, inner) => used.has(style) ? `<div id="bgl-${style}" class="bgl" style="opacity:${timeline[0].style === style ? 1 : 0}">${inner}</div>\n      ` : '';
  return layer('blur', '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i>')
    + layer('aurora', '<i class="a1"></i><i class="a2"></i><i class="a3"></i>')
    + layer('grid', '<i class="g-horizon"></i><i class="g-floor"></i>')
    + layer('gradient', '<i class="gr"></i>')
    + layer('spotlight', '<i class="sp"></i><i class="sp2"></i>');
}

export function bgCss(T) {
  return `
      /* background scenery (see src/backgrounds.mjs) */
      .bgl { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
      .bgl i { position: absolute; display: block; }
      #bgl-blur i { width: 1000px; height: 1000px; border-radius: 50%; filter: blur(130px); }
      #bgl-blur .b1 { left: -380px; top: -200px; background: ${al(T.glow, '66')}; }
      #bgl-blur .b2 { right: -460px; top: 560px; background: ${al(T.glow2, '55')}; }
      #bgl-blur .b3 { left: -300px; bottom: -420px; background: ${al(T.orbit2, '3a')}; }
      #bgl-blur .b4 { right: -300px; bottom: -560px; background: ${al(T.accent, '44')}; }
      #bgl-aurora i { top: -20%; height: 140%; width: 380px; filter: blur(70px); transform-origin: 50% 0; }
      #bgl-aurora .a1 { left: 8%; background: linear-gradient(${al(T.glow, '00')}, ${al(T.glow, '77')} 45%, ${al(T.glow2, '00')}); }
      #bgl-aurora .a2 { left: 38%; width: 460px; background: linear-gradient(${al(T.orbit2, '00')}, ${al(T.orbit2, '55')} 50%, ${al(T.glow, '00')}); }
      #bgl-aurora .a3 { left: 66%; background: linear-gradient(${al(T.glow2, '00')}, ${al(T.glow2, '6a')} 40%, ${al(T.accent, '00')}); }
      #bgl-grid .g-horizon { left: -20%; right: -20%; top: 46%; height: 520px; background: radial-gradient(ellipse at 50% 60%, ${al(T.glow, '55')}, transparent 68%); }
      #bgl-grid .g-floor { left: -60%; width: 220%; top: 52%; bottom: -10%; transform: perspective(700px) rotateX(64deg); transform-origin: 50% 0;
        background-image: linear-gradient(${al(T.accent, '55')} 3px, transparent 3px), linear-gradient(90deg, ${al(T.accent, '55')} 3px, transparent 3px); background-size: 140px 140px;
        -webkit-mask-image: linear-gradient(transparent, #000 35%); mask-image: linear-gradient(transparent, #000 35%); }
      #bgl-gradient .gr { left: -60%; top: -60%; width: 220%; height: 220%; background: linear-gradient(135deg, ${al(T.glow, '55')} 0%, ${al(T.bg, '00')} 34%, ${al(T.glow2, '44')} 62%, ${al(T.orbit2, '30')} 100%); }
      #bgl-spotlight .sp { left: -30%; right: -30%; top: -10%; height: 90%; background: radial-gradient(ellipse 34% 60% at 50% 0%, ${al(T.text, '2a')}, ${al(T.text, '00')} 72%); }
      #bgl-spotlight .sp2 { left: -20%; right: -20%; bottom: -30%; height: 60%; background: radial-gradient(ellipse 50% 50% at 50% 100%, ${al(T.glow, '30')}, transparent 70%); }
`;
}

// The timeline: slow drifts per style, and the crossfades between them.
export function bgScript(timeline, DUR) {
  const styles = [...new Set(timeline.map(x => x.style))];
  const drift = {
    blur: `tl.fromTo('#bgl-blur .b1', { x: 0, y: 0 }, { x: 260, y: 220, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-blur .b2', { x: 0, y: 0 }, { x: -240, y: -300, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-blur .b3', { x: 0, y: 0 }, { x: 320, y: -180, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-blur .b4', { x: 0, y: 0 }, { x: -280, y: -240, duration: ${DUR}, ease: 'sine.inOut' }, 0);`,
    aurora: `tl.fromTo('#bgl-aurora .a1', { rotation: -14, x: -60 }, { rotation: 10, x: 120, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-aurora .a2', { rotation: 12, x: 80 }, { rotation: -12, x: -120, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-aurora .a3', { rotation: -8, x: 40 }, { rotation: 14, x: -80, duration: ${DUR}, ease: 'sine.inOut' }, 0);`,
    grid: `tl.fromTo('#bgl-grid .g-floor', { backgroundPosition: '0px 0px' }, { backgroundPosition: '0px ${Math.round(140 * Math.max(2, DUR * 1.5))}px', duration: ${DUR}, ease: 'none' }, 0);
      tl.fromTo('#bgl-grid .g-horizon', { opacity: 0.7 }, { opacity: 1, duration: ${DUR}, ease: 'sine.inOut' }, 0);`,
    gradient: `tl.fromTo('#bgl-gradient .gr', { rotation: 0 }, { rotation: 50, duration: ${DUR}, ease: 'none' }, 0);`,
    spotlight: `tl.fromTo('#bgl-spotlight .sp', { x: -280, rotation: -6 }, { x: 280, rotation: 6, duration: ${DUR}, ease: 'sine.inOut' }, 0);
      tl.fromTo('#bgl-spotlight .sp2', { opacity: 0.6 }, { opacity: 1, duration: ${DUR}, ease: 'sine.inOut' }, 0);`
  };
  // Each style's own layer: on while its turn lasts, faded in and out around it. Orbit's elements live in #bgl-orbit.
  const fades = styles.filter(s => s !== 'solid').flatMap(s => timeline.flatMap((x, i) => {
    if (x.style !== s) return [];
    const next = timeline[i + 1];
    return [
      i > 0 ? `tl.fromTo('#bgl-${s}', { opacity: 0 }, { opacity: 1, duration: ${bgFade}, ease: 'sine.inOut', immediateRender: false }, ${x.t});` : '',
      next ? `tl.to('#bgl-${s}', { opacity: 0, duration: ${bgFade}, ease: 'sine.inOut' }, ${next.t});` : ''
    ].filter(Boolean);
  }));
  return `
      // Background scenery.
      ${styles.filter(s => drift[s]).map(s => drift[s]).join('\n      ')}
      ${fades.join('\n      ')}`;
}

// The wrapper of the ring scene (glow, rings), whose elements the template writes itself.
export const bgOrbitOpen = timeline => `<div id="bgl-orbit" class="bgl" style="opacity:${timeline[0].style === 'orbit' ? 1 : 0}">`;
