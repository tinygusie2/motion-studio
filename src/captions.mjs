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

// Start time of every word in a block. A block made from speech recognition carries `wo` (each word's start, in
// seconds after the block's start): those times are used as long as the text still has as many words as `wo` has
// (so fixing a typo keeps them, rewriting the sentence falls back to the estimate). They move with the block.
export function timeWords(sub) {
  const toks = tokens(sub.text);
  if (Array.isArray(sub.wo) && sub.wo.length === toks.length && toks.length) {
    const last = Math.max(sub.t, sub.out - 0.05);
    return toks.map((x, i) => ({ ...x, t: +Math.min(sub.t + Math.max(0, +sub.wo[i] || 0), last).toFixed(3) }));
  }
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
  const first = { ...sub, out: t, text: join(ws.slice(0, cut)) }, second = { ...sub, t, text: join(ws.slice(cut)) };
  if (sub.wo?.length === ws.length) {
    first.wo = sub.wo.slice(0, cut);
    second.wo = ws.slice(cut).map(w => +Math.max(0, w.t - t).toFixed(3));
  } else { delete first.wo; delete second.wo; }
  return [first, second];
}

// ---------- speech recognition ----------
// The words of a whisper.cpp JSON transcript (run with `-ml 1 -sow`, so one word per entry) as [{ w, t, e }] in seconds.
// An entry that doesn't start with a space (a comma, the rest of a word) is glued to the word before it; sound
// descriptions like [MUSIC] or (laughs) are dropped.
export function wordsFromWhisper(json) {
  const out = [];
  for (const seg of json?.transcription || []) {
    const raw = String(seg.text ?? '');
    const text = raw.trim();
    if (!text || /^[[(♪*].*[\])♪*]$/.test(text) || /^[[(]/.test(text)) continue;
    const t = (seg.offsets?.from ?? 0) / 1000, e = (seg.offsets?.to ?? 0) / 1000;
    if (out.length && !/^\s/.test(raw)) { const p = out[out.length - 1]; p.w += text; p.e = Math.max(p.e, e); continue; }
    out.push({ w: text, t: +t.toFixed(3), e: +Math.max(e, t + 0.05).toFixed(3) });
  }
  return out;
}

// Caption blocks from timed words: a new block after a pause, after a sentence end once there are a few words, and
// when a block gets too long. Every block keeps its exact word times in `wo`.
export function subsFromWords(words, { maxWords = 9, maxLen = 4, pause = 0.7 } = {}) {
  const blocks = [];
  let cur = [];
  const flush = () => { if (cur.length) blocks.push(cur); cur = []; };
  for (const w of words || []) {
    const prev = cur[cur.length - 1];
    if (prev && (w.t - prev.e > pause || cur.length >= maxWords || w.e - cur[0].t > maxLen || (cur.length >= 3 && /[.!?…]["')]*$/.test(prev.w)))) flush();
    cur.push(w);
  }
  flush();
  return blocks.map((b, i) => {
    const t = b[0].t, next = blocks[i + 1]?.[0].t ?? Infinity;
    const out = Math.min(b[b.length - 1].e + 0.15, next);
    return { t: +t.toFixed(3), out: +Math.max(out, t + 0.1).toFixed(3), text: b.map(w => w.w).join(' '), wo: b.map(w => +(w.t - t).toFixed(3)) };
  });
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
