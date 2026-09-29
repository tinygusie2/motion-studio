// Demo data: made-up people and content to fill an app with while recording a demo, so a video never shows real
// data and every take starts from the same state. Pure module, also served to the editor at /lib/demo.mjs.
//
// A dataset: { id, name, fields: { email: '…', name: '…', … }, storage?: { local: {…}, session: {…}, cookies: [{ name, value }] } }
// `fields` are what gets typed into inputs; `storage` is put in the app (localStorage, sessionStorage, cookies) before it loads.

// The kinds of field we know how to recognise in an input, most specific first, with the words that give them away
// (Dutch and English), matched against the input's type, name, id, placeholder, label and autocomplete.
export const fieldKinds = [
  ['username', ['username', 'gebruikersnaam', 'user name', 'login', 'inlognaam']],
  ['email', ['email', 'e-mail', 'mail', 'mailadres']],
  ['password', ['password', 'wachtwoord', 'passwd']],
  ['firstName', ['firstname', 'first name', 'first-name', 'given-name', 'voornaam']],
  ['lastName', ['lastname', 'last name', 'last-name', 'family-name', 'achternaam', 'surname']],
  ['phone', ['phone', 'telephone', 'tel', 'telefoon', 'mobile', 'mobiel', 'gsm']],
  ['zip', ['zip', 'zipcode', 'postal', 'postcode']],
  ['city', ['city', 'stad', 'plaats', 'woonplaats']],
  ['address', ['address', 'adres', 'street', 'straat']],
  ['age', ['age', 'leeftijd']],
  ['weight', ['weight', 'gewicht']],
  ['search', ['search', 'zoek', 'query']],
  ['message', ['message', 'bericht', 'comment', 'opmerking', 'notitie', 'note', 'notes', 'description', 'beschrijving', 'textarea']],
  ['name', ['name', 'naam', 'fullname', 'full name', 'volledige naam'] ]
];
export const fieldLabels = {
  username: 'Gebruikersnaam', email: 'E-mail', password: 'Wachtwoord', firstName: 'Voornaam', lastName: 'Achternaam', phone: 'Telefoon',
  zip: 'Postcode', city: 'Plaats', address: 'Adres', age: 'Leeftijd', weight: 'Gewicht', search: 'Zoekopdracht', message: 'Bericht', name: 'Naam'
};

const norm = s => String(s || '').toLowerCase();

// The words of some hint text: split on anything that is not a letter or digit, and on camelCase (firstName → first, name).
const wordsOf = text => String(text || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Does the hint contain this word? Whole words only ("age" is not in "message"); longer words also match as the start
// of a word ("email" in "emailaddress"), and a phrase like "first name" also matches "firstname".
function hasWord(tokens, word) {
  const parts = word.split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length > 1) {
    for (let i = 0; i + parts.length <= tokens.length; i++) if (parts.every((p, k) => tokens[i + k] === p)) return true;
    const glued = parts.join('');
    return glued.length >= 7 && tokens.some(t => t.startsWith(glued));
  }
  return tokens.some(t => t === word || (word.length >= 5 && t.startsWith(word)));
}

// What kind of field an input is, from its hints ({ type, name, id, placeholder, label, autocomplete, aria }), or null.
export function fieldKind(hints = {}) {
  const type = norm(hints.type);
  if (type === 'email') return 'email';
  if (type === 'password') return 'password';
  if (type === 'tel') return 'phone';
  if (type === 'search') return 'search';
  const tokens = wordsOf([hints.autocomplete, hints.name, hints.id, hints.placeholder, hints.label, hints.aria].join(' '));
  if (!tokens.length) return type === 'textarea' || hints.tag === 'textarea' ? 'message' : null;
  for (const [kind, words] of fieldKinds) if (words.some(w => hasWord(tokens, w))) return kind;
  return hints.tag === 'textarea' ? 'message' : null;
}

// The value a dataset has for an input: its own field for that kind, or (for a custom field) one whose key appears in
// the hints. Returns { kind, key, value } or null.
export function pickValue(dataset, hints = {}) {
  const fields = dataset?.fields || {};
  const kind = fieldKind(hints);
  if (kind && fields[kind] != null && fields[kind] !== '') return { kind, key: kind, value: String(fields[kind]) };
  // "name" falls back to first + last name, and the other way round.
  if (kind === 'name' && (fields.firstName || fields.lastName)) return { kind, key: 'name', value: [fields.firstName, fields.lastName].filter(Boolean).join(' ') };
  if (kind === 'firstName' && fields.name) return { kind, key: 'name', value: String(fields.name).split(' ')[0] };
  if (kind === 'lastName' && fields.name) return { kind, key: 'name', value: String(fields.name).split(' ').slice(1).join(' ') };
  const text = [hints.name, hints.id, hints.placeholder, hints.label, hints.aria].map(norm).join(' ');
  for (const [key, value] of Object.entries(fields)) if (!fieldLabels[key] && value !== '' && key.length > 2 && text.includes(norm(key))) return { kind: null, key, value: String(value) };
  return null;
}

// Made-up sample data to start from, in the brand's language.
export function defaultDatasets(lang = 'en') {
  const nl = lang === 'nl';
  return [{
    id: 'persona-1', name: nl ? 'Jan de Vries' : 'Alex Morgan',
    fields: nl
      ? { name: 'Jan de Vries', firstName: 'Jan', lastName: 'de Vries', email: 'jan@voorbeeld.nl', username: 'jandevries', password: 'demo-wachtwoord', phone: '06 12345678', city: 'Utrecht', zip: '3511 AB', address: 'Voorbeeldstraat 12', age: '28', weight: '78', search: 'boodschappen', message: 'Dit is een voorbeeldbericht voor de demo.' }
      : { name: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com', username: 'alexmorgan', password: 'demo-password', phone: '+1 555 0100', city: 'Portland', zip: '97201', address: '12 Example Street', age: '28', weight: '78', search: 'groceries', message: 'This is a sample message for the demo.' }
  }];
}

// Storage to set before an app loads: [{ kind: 'local' | 'session', key, value }] and cookies, for the url's origin.
export function storageEntries(dataset) {
  const s = dataset?.storage || {};
  const entries = [];
  for (const kind of ['local', 'session']) for (const [key, value] of Object.entries(s[kind] || {})) entries.push({ kind, key, value: typeof value === 'string' ? value : JSON.stringify(value) });
  return { entries, cookies: (s.cookies || []).filter(c => c?.name) };
}
// The script that puts those entries in the page before anything of the app runs.
export function storageScript(dataset) {
  const { entries } = storageEntries(dataset);
  if (!entries.length) return '';
  return `(() => { try { ${entries.map(e => `${e.kind}Storage.setItem(${JSON.stringify(e.key)}, ${JSON.stringify(e.value)});`).join(' ')} } catch {} })();`;
}

// A believable typing rhythm: how long to wait before each character (ms). Same text and seed, same rhythm.
export function typingPlan(text, seed = 7) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return [...String(text)].map((ch, i) => {
    let d = 55 + rnd() * 55;
    if (ch === ' ') d += 25;
    if (/[.,!?;:]/.test(ch)) d += 90;
    if (i > 0 && rnd() < 0.05) d += 160; // a moment of thought
    return Math.round(d);
  });
}
