// The launcher page: one card per editor, rendered again from every state the main process sends.
const strings = {
  en: {
    title: 'Your editors', check: 'Check for updates', checking: 'Checking…', checked: 'Checked {0}',
    autoUpdate: 'Install updates automatically', closeOnLaunch: 'Close after starting',
    addEditor: 'Add an editor…', openRoot: 'Install folder',
    start: 'Start', install: 'Install ({0})', update: 'Update to {0}', retry: 'Try again', folder: 'Folder', release: 'Release page',
    installed: 'Version {0} installed', notInstalled: 'Not installed', latest: 'latest {0}', noRelease: 'No release published yet',
    badgeUpdate: 'Update', badgeOk: 'Up to date', badgeFree: 'Free slot', badgeSoon: 'Coming soon', soon: 'Not released yet', configure: 'Set up…', repo: 'GitHub',
    download: 'Downloading… {0}', verify: 'Checking the download…', extract: 'Unpacking…',
    checkFailed: 'Could not check for updates: {0}', failed: 'Failed: {0}', notes: 'What’s new in {0}', unverified: 'installed without a checksum', found: 'found on this PC'
  },
  nl: {
    title: 'Je editors', check: 'Op updates controleren', checking: 'Controleren…', checked: 'Gecontroleerd om {0}',
    autoUpdate: 'Updates automatisch installeren', closeOnLaunch: 'Sluiten na starten',
    addEditor: 'Editor toevoegen…', openRoot: 'Installatiemap',
    start: 'Starten', install: 'Installeren ({0})', update: 'Bijwerken naar {0}', retry: 'Opnieuw proberen', folder: 'Map', release: 'Releasepagina',
    installed: 'Versie {0} geïnstalleerd', notInstalled: 'Niet geïnstalleerd', latest: 'nieuwste {0}', noRelease: 'Nog geen release gepubliceerd',
    badgeUpdate: 'Update', badgeOk: 'Actueel', badgeFree: 'Vrije plek', badgeSoon: 'Binnenkort', soon: 'Nog niet uitgebracht', configure: 'Instellen…', repo: 'GitHub',
    download: 'Downloaden… {0}', verify: 'Download controleren…', extract: 'Uitpakken…',
    checkFailed: 'Kon niet op updates controleren: {0}', failed: 'Mislukt: {0}', notes: 'Wat is er nieuw in {0}', unverified: 'geïnstalleerd zonder checksum', found: 'gevonden op deze pc'
  }
};
let lang = 'en';
const t = (key, ...args) => (strings[lang][key] ?? strings.en[key] ?? key).replace(/\{(\d)\}/g, (_, i) => args[i] ?? '');
const mb = bytes => `${(bytes / 1048576).toFixed(0)} MB`;
const $ = sel => document.querySelector(sel);

function button(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = label; if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

async function run(id, action) {
  const error = await window.launcher[action](id);
  if (error) { const card = document.querySelector(`.card[data-id="${id}"] .msg`); card.hidden = false; card.className = 'msg error'; card.textContent = t('failed', error); }
}

// Release notes are GitHub markdown. They are built as DOM nodes (never as HTML), with the parts release notes use:
// headings, paragraphs, lists, tables, quotes, rules, **bold**, *italic*, `code` and links. Images and HTML tags are left out.
function inline(text) {
  const out = document.createDocumentFragment();
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\))/g;
  let at = 0, m;
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '');
  while ((m = re.exec(text))) {
    if (m.index > at) out.append(text.slice(at, m.index));
    let node;
    if (m[2] || m[3]) { node = document.createElement('strong'); node.append(inline(m[2] || m[3])); }
    else if (m[4] || m[5]) { node = document.createElement('em'); node.append(inline(m[4] || m[5])); }
    else if (m[6]) { node = document.createElement('code'); node.textContent = m[6]; }
    else { node = document.createElement('a'); node.href = m[8]; node.target = '_blank'; node.append(inline(m[7])); }
    out.append(node);
    at = re.lastIndex;
  }
  if (at < text.length) out.append(text.slice(at));
  return out;
}
function markdown(src) {
  const root = document.createDocumentFragment();
  const lines = src.replace(/\r/g, '').split('\n');
  const make = (tag, text) => { const e = document.createElement(tag); if (text != null) e.append(inline(text)); return e; };
  const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    let m;
    if (!line.trim() || /^\s*<[^>]+>\s*$/.test(line) || /^\s*!\[/.test(line)) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)/.exec(line))) { root.append(make(m[1].length <= 2 ? 'h3' : 'h4', m[2])); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { root.append(document.createElement('hr')); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const table = document.createElement('table'), head = document.createElement('tr');
      for (const c of cells(line)) head.append(make('th', c));
      table.append(head); i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { const tr = document.createElement('tr'); for (const c of cells(lines[i])) tr.append(make('td', c)); table.append(tr); i++; }
      root.append(table); continue;
    }
    if (isList(line)) {
      const list = document.createElement(/^\s*\d/.test(line) ? 'ol' : 'ul');
      while (i < lines.length && (m = /^\s*([-*+]|\d+[.)])\s+(.*)/.exec(lines[i]))) { list.append(make('li', m[2])); i++; }
      root.append(list); continue;
    }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      root.append(make('blockquote', q.join(' '))); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*\|)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++].trim());
    if (para.length) root.append(make('p', para.join(' '))); else i++;
  }
  return root;
}
const dateOf = iso => { try { return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };

function card(a) {
  const el = $('#card').content.firstElementChild.cloneNode(true);
  el.dataset.id = a.id;
  el.classList.toggle('placeholder', a.placeholder);
  el.querySelector('.name').textContent = a.name;
  el.querySelector('.desc').textContent = a.description || '';
  const icon = el.querySelector('.icon');
  if (a.icon) { const img = document.createElement('img'); img.src = a.icon; img.alt = ''; icon.append(img); } else icon.textContent = '+';

  const actions = el.querySelector('.actions'), msg = el.querySelector('.msg'), badge = el.querySelector('.badge');
  const note = (text, cls = 'msg') => { msg.hidden = false; msg.className = cls; msg.textContent = text; };

  if (a.placeholder) {
    el.querySelector('.version').textContent = a.comingSoon ? t('soon') : '';
    badge.hidden = false; badge.textContent = t(a.comingSoon ? 'badgeSoon' : 'badgeFree');
    if (!a.comingSoon) actions.append(button(t('configure'), () => window.launcher.open('apps-file')));
    return el;
  }

  const { installed, latest, job } = a;
  const parts = [installed ? t('installed', installed.version) : t('notInstalled')];
  if (latest?.version && (!installed || a.update)) parts.push(t('latest', latest.version));
  if (installed?.found) parts.push(t('found'));
  else if (installed && installed.verified === false) parts.push(t('unverified'));
  el.querySelector('.version').textContent = parts.join(' · ');
  if (installed && a.update) { badge.hidden = false; badge.textContent = t('badgeUpdate'); }
  else if (installed && latest?.version) { badge.hidden = false; badge.textContent = t('badgeOk'); badge.classList.add('ok'); }

  const busy = job && job.phase !== 'error';
  if (busy) {
    const bar = el.querySelector('.progress'), fill = bar.querySelector('.fill');
    bar.hidden = false;
    if (job.phase === 'download' && job.total) {
      fill.style.width = `${Math.min(100, (job.received / job.total) * 100).toFixed(1)}%`;
      note(t('download', `${mb(job.received)} / ${mb(job.total)}`));
    } else {
      bar.classList.add('busy');
      note(t(job.phase === 'download' ? 'download' : job.phase, ''));
    }
  } else if (job?.phase === 'error') note(t('failed', job.error), 'msg error');
  else if (latest?.error) note(t('checkFailed', latest.error), 'msg error');
  else if (latest && !latest.zip) note(t('noRelease'));

  if (latest?.notes) {
    const notes = el.querySelector('.notes');
    notes.hidden = false;
    notes.classList.toggle('fresh', !!a.update);
    notes.querySelector('.n-title').textContent = t('notes', latest.version);
    notes.querySelector('.n-date').textContent = latest.published ? dateOf(latest.published) : '';
    notes.querySelector('.body').replaceChildren(markdown(latest.notes));
  }

  if (installed) actions.append(button(t('start'), () => run(a.id, 'launch'), 'primary'));
  if (a.update && !busy) {
    const label = installed ? t('update', latest.version) : t('install', `${latest.version} · ${mb(latest.zip.size)}`);
    actions.append(button(job?.phase === 'error' ? t('retry') : label, () => run(a.id, 'install'), installed ? '' : 'primary'));
  }
  if (installed) actions.append(button(t('folder'), () => window.launcher.open('folder', a.id), 'ghost'));
  if (latest?.url) actions.append(button(t('release'), () => window.launcher.open('release', a.id), 'ghost'));
  else if (a.repo) actions.append(button(t('repo'), () => window.launcher.open('repo', a.id), 'ghost'));
  return el;
}

function render(state) {
  if (lang !== state.lang) {
    lang = state.lang;
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  }
  $('#autoUpdate').checked = state.settings.autoUpdate;
  $('#closeOnLaunch').checked = state.settings.closeOnLaunch;
  // Keep open release notes open across renders.
  const open = new Set([...document.querySelectorAll('.card .notes[open]')].map(d => d.closest('.card').dataset.id));
  $('#apps').replaceChildren(...state.apps.map(a => {
    const el = card(a);
    if (open.has(a.id)) el.querySelector('.notes').open = true;
    return el;
  }));
}

async function check() {
  const btn = $('#check');
  btn.disabled = true; $('#status').textContent = t('checking');
  try { render(await window.launcher.check()); }
  finally {
    btn.disabled = false;
    $('#status').textContent = t('checked', new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }));
  }
}

$('#check').addEventListener('click', check);
$('#autoUpdate').addEventListener('change', e => window.launcher.settings({ autoUpdate: e.target.checked }));
$('#closeOnLaunch').addEventListener('change', e => window.launcher.settings({ closeOnLaunch: e.target.checked }));
$('#addEditor').addEventListener('click', () => window.launcher.open('apps-file'));
$('#openRoot').addEventListener('click', () => window.launcher.open('folder'));
window.launcher.onState(render);
window.launcher.state().then(render).then(check);
