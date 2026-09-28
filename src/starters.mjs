// Starter videos: ready-made set-ups for the common kinds of app promo, filled with the project's own clips.
// Each starter is a function of what the project has; the result is an ordinary spec the user then edits.
// Text comes in the brand's language (English when there is no table for it), with *asterisks* for the accent.

const isImage = src => /\.(png|jpe?g|webp|gif)$/i.test(src);
const r2 = n => Math.round(n * 100) / 100;

// Puts clips back to back from `from` to `to`, `count` of them, using the project's clips in order (repeating when
// there are fewer). Videos are cut short to their real length when it is known.
function lineUp(clips, count, from, to, clipDur = {}) {
  if (!clips.length) return [];
  const seg = (to - from) / count;
  return Array.from({ length: count }, (_, i) => {
    const src = clips[i % clips.length];
    const known = !isImage(src) && clipDur[src];
    return { src, start: r2(from + i * seg), dur: r2(known ? Math.min(seg, known) : seg), media: 0 };
  });
}

const text = {
  en: {
    launch: { overline: 'Now available', heads: ['Meet *{name}.*', 'Everything you need, *in one app.*', 'Fast, simple *and free.*'],
      chips: [['NEW', 'Now on iOS and Android'], ['FREE', 'No account needed']], tagline: 'Try it *today.*' },
    howto: { overline: 'How to', heads: ['Do it *in 3 steps.*', '*1.* Open the app', '*2.* Tap the button', '*3.* Done!'],
      tagline: 'That was *easy.*' },
    compare: { overline: 'Before and after', heads: ['Stop doing it *the hard way.*', 'Same result, *half the time.*'],
      names: ['Before', 'After'], chips: [['BEFORE', 'Slow'], ['AFTER', 'Fast']], tagline: 'Upgrade *your routine.*' },
    website: { overline: 'Website tour', heads: ['Your website, *explained.*', 'Find it *on the home page.*', 'Click, *and you are in.*'],
      tagline: 'Visit us *today.*' },
    tip: { overline: 'Quick tip', heads: ['A tip *you will use daily.*'],
      subs: ['Did you know you can do *this?*', 'Just open the app', 'and it is *done.*', 'Save this for later!'], tagline: 'Follow for *more tips.*' }
  },
  nl: {
    launch: { overline: 'Nu beschikbaar', heads: ['Maak kennis met *{name}.*', 'Alles wat je nodig hebt, *in één app.*', 'Snel, simpel *en gratis.*'],
      chips: [['NIEUW', 'Nu op iOS en Android'], ['GRATIS', 'Geen account nodig']], tagline: 'Probeer het *vandaag.*' },
    howto: { overline: 'Zo werkt het', heads: ['Zo doe je het *in 3 stappen.*', '*1.* Open de app', '*2.* Tik op de knop', '*3.* Klaar!'],
      tagline: 'Dat was *makkelijk.*' },
    compare: { overline: 'Voor en na', heads: ['Stop met *de moeilijke manier.*', 'Zelfde resultaat, *in de helft van de tijd.*'],
      names: ['Voor', 'Na'], chips: [['VOOR', 'Traag'], ['NA', 'Snel']], tagline: 'Upgrade *je routine.*' },
    website: { overline: 'Rondleiding', heads: ['Je website, *uitgelegd.*', 'Je vindt het *op de homepage.*', 'Klik, *en je bent binnen.*'],
      tagline: 'Kom *vandaag* langs.' },
    tip: { overline: 'Snelle tip', heads: ['Een tip *die je elke dag gebruikt.*'],
      subs: ['Wist je dat je *dit* kunt doen?', 'Open gewoon de app', 'en het is *klaar.*', 'Bewaar dit voor later!'], tagline: 'Volg voor *meer tips.*' }
  }
};

// id → { label, hint, icon, layout, make(ctx) }. ctx: { brandName, lang, clips, clipDur, dev: { layout: [w, h] } }
export const starters = {
  launch: {
    label: 'App-lancering', hint: 'Hook, drie punten, twee callouts en een zoom. Voor een nieuwe app of update.', icon: 'rocket_launch', layout: 'phone',
    make: (t, c) => ({
      dur: 15, end: 12.6,
      heads: [{ t: 0, text: t.heads[0], hook: true }, { t: 3.2, text: t.heads[1] }, { t: 7.4, text: t.heads[2] }],
      clips: lineUp(c.clips, Math.min(3, Math.max(1, c.clips.length)), 0.9, 12.6, c.clipDur),
      chips: [
        { t: 1.6, out: 5.2, icon: 'rocket_launch', color: 'lime', label: t.chips[0][0], text: t.chips[0][1], x: 70, y: 1420 },
        { t: 8, out: 11.6, icon: 'celebration', color: 'blue', label: t.chips[1][0], text: t.chips[1][1], x: 70, y: 1420 }
      ],
      zooms: [{ t: 4.6, scale: 1.35, y: 160, dur: 0.9, out: 7.2 }]
    })
  },
  howto: {
    label: 'Uitleg in 3 stappen', hint: 'Een kop per stap, met een tik op het scherm en een marker bij elke stap.', icon: 'format_list_numbered', layout: 'phone',
    make: (t, c) => {
      const [w, h] = c.dev.phone || [640, 1358];
      const steps = [2.6, 5.8, 9];
      return {
        dur: 15, end: 12.4,
        heads: [{ t: 0, text: t.heads[0], hook: true }, ...steps.map((s, i) => ({ t: s, text: t.heads[i + 1] }))],
        clips: lineUp(c.clips, 1, 0.9, 12.4, c.clipDur),
        taps: steps.slice(0, 2).map((s, i) => ({ t: r2(s + 1.2), x: Math.round(w * (i ? 0.7 : 0.5)), y: Math.round(h * (i ? 0.72 : 0.4)) })),
        zooms: [{ t: 6.2, scale: 1.3, y: 160, dur: 0.8, out: 8.8, fx: Math.round(w * 0.7), fy: Math.round(h * 0.72) }],
        markers: steps.map(t => ({ t }))
      };
    }
  },
  compare: {
    label: 'Voor en na', hint: 'Twee telefoons naast elkaar: links hoe het was, rechts met jouw app.', icon: 'compare', layout: 'dual',
    make: (t, c) => ({
      dur: 14, end: 11.4, names: t.names,
      heads: [{ t: 0, text: t.heads[0], hook: true }, { t: 5.2, text: t.heads[1] }],
      clips: lineUp(c.clips, 1, 0.9, 11.4, c.clipDur),
      clips2: lineUp(c.clips.length > 1 ? c.clips.slice(1) : c.clips, 1, 0.9, 11.4, c.clipDur),
      chips: [
        { t: 1.4, out: 11, icon: 'close', color: 'orange', label: t.chips[0][0], text: t.chips[0][1], x: 120, y: 1500 },
        { t: 2.4, out: 11, icon: 'check_circle', color: 'lime', label: t.chips[1][0], text: t.chips[1][1], x: 620, y: 1500 }
      ]
    })
  },
  website: {
    label: 'Website-rondleiding', hint: 'Browservenster met muisklikken en twee zooms. Voor web-apps en landingspagina\'s.', icon: 'language', layout: 'browser',
    make: (t, c) => {
      const [w, h] = c.dev.browser || [1000, 700];
      return {
        dur: 14, end: 11.6,
        heads: [{ t: 0, text: t.heads[0], hook: true }, { t: 3.4, text: t.heads[1] }, { t: 7.2, text: t.heads[2] }],
        clips: lineUp(c.clips, Math.min(2, Math.max(1, c.clips.length)), 0.9, 11.6, c.clipDur),
        taps: [{ t: 5, x: Math.round(w * 0.3), y: Math.round(h * 0.35), style: 'cursor' }, { t: 8.6, x: Math.round(w * 0.72), y: Math.round(h * 0.6), style: 'cursor' }],
        zooms: [
          { t: 4, scale: 1.5, y: 160, dur: 0.9, out: 6.4, fx: Math.round(w * 0.3), fy: Math.round(h * 0.35) },
          { t: 7.8, scale: 1.5, y: 160, dur: 0.9, out: 10.4, fx: Math.round(w * 0.72), fy: Math.round(h * 0.6) }
        ]
      };
    }
  },
  tip: {
    label: 'Snelle tip', hint: 'Beeldvullend met grote ondertitels. Voor een korte tip of een how-to zonder apparaat.', icon: 'lightbulb', layout: 'full',
    make: (t, c) => ({
      dur: 12, end: 9.6,
      heads: [{ t: 0, text: t.heads[0], hook: true }],
      clips: lineUp(c.clips, 1, 0, 9.6, c.clipDur),
      subs: t.subs.map((s, i) => ({ t: r2(1.2 + i * 2), out: r2(3 + i * 2), text: s })),
      captions: { style: 'pop' }
    })
  }
};

// A new spec from a starter. Unknown ids fall back to the first starter.
export function starterSpec(id, { brandId, brandName = 'our app', lang = 'en', clips = [], clipDur = {}, dev = {} } = {}) {
  const s = starters[id] || starters.launch;
  const t = (text[lang] || text.en)[starters[id] ? id : 'launch'];
  const fill = x => x.replace('{name}', brandName);
  const body = s.make(t, { clips, clipDur, dev });
  return {
    brand: brandId, layout: s.layout, overline: t.overline, tagline: t.tagline,
    heads: [], clips: [], clips2: [], chips: [], zooms: [], taps: [], subs: [], vo: { lines: [] },
    ...body,
    heads: (body.heads || []).map(h => ({ ...h, text: fill(h.text) }))
  };
}
