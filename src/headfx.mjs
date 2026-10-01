// How a headline comes in and goes out. Each effect is GSAP vars for the words of the headline (`.wi`): an "in" is a
// from/to pair, an "out" is a `to`. `open` = the effect needs the words' clipping mask off (scale, blur and fades would be cut).
// Shared by the template (timeline) and the editor (labels).
export const headIns = {
  rise: { label: 'Omhoog (standaard)', from: { yPercent: 110, rotation: 4 }, to: { yPercent: 0, rotation: 0, duration: 0.55, ease: 'power4.out', stagger: 0.06 } },
  drop: { label: 'Van boven', from: { yPercent: -110, rotation: -4 }, to: { yPercent: 0, rotation: 0, duration: 0.55, ease: 'power4.out', stagger: 0.06 } },
  fade: { label: 'Vervagen', open: true, from: { opacity: 0 }, to: { opacity: 1, duration: 0.6, ease: 'power2.out', stagger: 0.08 } },
  pop: { label: 'Pop', open: true, from: { scale: 0.4, opacity: 0 }, to: { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.07 } },
  slide: { label: 'Van links', open: true, from: { xPercent: -60, opacity: 0 }, to: { xPercent: 0, opacity: 1, duration: 0.55, ease: 'power3.out', stagger: 0.07 } },
  blur: { label: 'Scherp worden', open: true, from: { filter: 'blur(26px)', opacity: 0, scale: 1.08 }, to: { filter: 'blur(0px)', opacity: 1, scale: 1, duration: 0.7, ease: 'power2.out', stagger: 0.09 } },
  // Letter effects (`chars`): the template splits the words into letters and drives them itself; `per` = seconds per letter.
  type: { label: 'Typemachine', chars: 'type', from: {}, to: { per: 0.05 } },
  scramble: { label: 'Letters husselen', chars: 'scramble', from: {}, to: { per: 0.04 } }
};
export const headOuts = {
  lift: { label: 'Omhoog (standaard)', to: { yPercent: -110, duration: 0.35, ease: 'power3.in', stagger: 0.025 } },
  drop: { label: 'Naar beneden', to: { yPercent: 110, duration: 0.35, ease: 'power3.in', stagger: 0.025 } },
  fade: { label: 'Vervagen', open: true, to: { opacity: 0, duration: 0.3, ease: 'power1.in', stagger: 0.03 } },
  blur: { label: 'Onscherp worden', open: true, to: { filter: 'blur(26px)', opacity: 0, duration: 0.35, ease: 'power2.in', stagger: 0.03 } },
  shrink: { label: 'Krimpen', open: true, to: { scale: 0.4, opacity: 0, duration: 0.3, ease: 'power3.in', stagger: 0.03 } },
  slide: { label: 'Naar rechts', open: true, to: { xPercent: 60, opacity: 0, duration: 0.3, ease: 'power3.in', stagger: 0.03 } }
};
export const headInDefault = 'rise', headOutDefault = 'lift';
export const headInOf = h => (headIns[h?.fxIn] ? h.fxIn : headInDefault);
export const headOutOf = h => (headOuts[h?.fxOut] ? h.fxOut : headOutDefault);
// What the page needs for its headlines: one { in, out } per headline, and the tables of the effects in use.
export function headPlan(heads) {
  const list = heads.map(h => ({ in: headInOf(h), out: headOutOf(h) }));
  const pick = (table, used) => Object.fromEntries([...new Set(used)].map(k => [k, { from: table[k].from, to: table[k].to, chars: table[k].chars }]));
  return { list, ins: pick(headIns, list.map(x => x.in)), outs: pick(headOuts, list.map(x => x.out)), open: heads.map(h => !!(headIns[headInOf(h)].open || headOuts[headOutOf(h)].open)) };
}
