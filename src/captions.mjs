// Captions: subtitle blocks on their own track ({ t, out, text }), shown a few words at a time.
// Blocks come from the voice-over lines, an imported .srt/.vtt, or are typed by hand. Word times inside
// a block are estimated from word length (TTS speech is fairly even), so editing a block's in/out re-times it.
// Pure module: used by the template, the server (SRT export) and the editor UI (served at /lib/captions.mjs).

export const captionStyles = {
  pop: 'Pop',
  karaoke: 'Karaoke',
  box: 'Blok',
  plain: 'Klassiek'
};
export const captionStyleHints = {
  pop: 'Woorden springen er één voor één in, het gesproken woord licht op.',
  karaoke: 'De hele groep staat er, gesproken woorden kleuren mee.',
  box: 'Het gesproken woord krijgt een gekleurd blok (TikTok-stijl).',
  plain: 'Rustige ondertitel met achtergrond, hele groep in één keer.'
};
// color/hi/ink null = brand text/accent/accent-ink.
export const captionDefaults = { style: 'pop', y: 1400, size: 76, words: 3, upper: false, outline: true, color: null, hi: null, ink: null };

export const captionStyle = (brand = {}, v = {}) => ({ ...captionDefaults, ...(brand.captions || {}), ...(v.captions || {}) });

// "Tap *import* now" → [{ w: 'Tap' }, { w: 'import', em: true }, { w: 'now' }] (same *accent* rule as headlines).
export function tokens(text) {
  let accent = false;
  return String(text || '').split(/\s+/).filter(Boolean).map(raw => {
    let w = raw;
    if (w.startsWith('*')) { accent = true; w = w.slice(1); }
    const closes = /\*[^\p{L}\p{N}]*$/u.test(w);
    const em = accent;
    if (closes) accent = false;
    w = w.replace(/\*/g, '');
    return em ? { w, em } : { w };
  }).filter(x => x.w);
}

// Longer words take longer to say; punctuation adds a pause after the word.
const weight = w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) + 1.5 + (/[.!?…]["')]*$/.test(w) ? 4 : /[,;:–-]["')]*$/.test(w) ? 2 : 0);

// Start time of every word in a block.
export function timeWords(sub) {
  const toks = tokens(sub.text);
  const total = toks.reduce((s, x) => s + weight(x.w), 0) || 1;
  const len = Math.max(0.1, sub.out - sub.t);
  let acc = 0;
  return toks.map(x => { const t = sub.t + (acc / total) * len; acc += weight(x.w); return { ...x, t: +t.toFixed(3) }; });
}

// Splits every block into on-screen groups of at most `max` words, breaking early after a sentence end
// (or a comma once the group has two words). Groups never run past `end` (the end card).
export function captionGroups(subs, max = 3, end = Infinity) {
  const out = [];
  for (const sub of [...(subs || [])].sort((a, b) => a.t - b.t)) {
    if (!(sub.out > sub.t)) continue;
    const ws = timeWords(sub);
    const groups = [];
    let cur = [];
    for (const w of ws) {
      cur.push(w);
      if (cur.length >= max || /[.!?…]["')]*$/.test(w.w) || (cur.length >= 2 && /[,;:]["')]*$/.test(w.w))) { groups.push(cur); cur = []; }
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, i) => {
      const s = g[0].t, e = Math.min(i + 1 < groups.length ? groups[i + 1][0].t : sub.out, end);
      if (e - s > 0.05) out.push({ s, e, words: g });
    });
  }
  return out;
}

// Where to cut a block at time t: the words before and after, each with its own in/out.
export function splitSub(sub, t) {
  const ws = timeWords(sub);
  const k = ws.findIndex(w => w.t >= t);
  const cut = k < 0 ? Math.max(1, ws.length - 1) : Math.max(1, k);
  const join = list => list.map(x => x.em ? `*${x.w}*` : x.w).join(' ').replace(/\* \*/g, ' ');
  return [{ ...sub, out: t, text: join(ws.slice(0, cut)) }, { ...sub, t, text: join(ws.slice(cut)) }];
}

// ---------- SRT / VTT ----------
const stamp = (t, sep = ',') => {
  const ms = Math.round(Math.max(0, t) * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
export function toSrt(subs, end = Infinity) {
  return [...(subs || [])].sort((a, b) => a.t - b.t).filter(s => s.t < end && String(s.text || '').trim())
    .map((s, i) => `${i + 1}\n${stamp(s.t)} --> ${stamp(Math.min(s.out, end))}\n${String(s.text).replace(/\*/g, '').trim()}\n`).join('\n');
}
const secs = s => { const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}` : NaN; };
export function parseSubtitles(text) {
  const subs = [];
  for (const block of String(text).replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim());
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const t = secs(a), out = secs(b);
    const body = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (body && out > t) subs.push({ t: +t.toFixed(2), out: +out.toFixed(2), text: body });
  }
  return subs;
}
