// The demo studio: operate your app on a device in this window, record it with every tap and swipe, fill it with demo
// data, and put the result (a clip with its taps) in the video. The picture and the input go through the server
// (src/demo-session.mjs), so the app itself runs in a Chrome page or on an Android device.
import { tapsFromGestures, insetFor } from '/lib/gestures.mjs';
import { fieldLabels } from '/lib/demo.mjs';

export function createDemoStudio(ctx) {
  const { S, api, el, icon, toast, V, round, commit, renderAll, select, loadState } = ctx;
  const st = { source: 'web', meta: { open: false }, data: { datasets: [], apps: [] }, dataset: null, result: null, timer: 0, pending: [], busy: false, moves: null, counts: { tap: 0, swipe: 0, type: 0 }, live: [] };
  let dlg, canvas, cx, es, finger, video;
  const $ = s => dlg.querySelector(s);

  // ---------- the dialog ----------
  function build() {
    canvas = el('canvas', { class: 'demo-canvas', tabindex: 0 });
    cx = canvas.getContext('2d');
    finger = el('i', { class: 'demo-finger' });
    dlg = el('dialog', { class: 'demo', id: 'dlg-demo' });
    dlg.append(
      el('header', { class: 'demo-head' },
        el('span', { class: 'job-badge' }, icon('smart_display')),
        el('div', { class: 'job-titles' }, el('h2', {}, 'Demo opnemen'), el('p', { class: 'muted', id: 'demo-sub' }, 'Bedien je app hier en neem elke tik en swipe op.')),
        el('span', { class: 'spacer' }),
        el('span', { id: 'demo-rec', class: 'demo-rec', hidden: true }, el('i'), el('b', { id: 'demo-time' }, '0:00')),
        el('button', { class: 'ghost icon', title: 'Sluiten', onclick: closeDialog }, icon('close'))),
      el('div', { class: 'demo-body' },
        el('div', { class: 'demo-stage' },
          el('div', { class: 'demo-nav', id: 'demo-nav' }),
          el('div', { class: 'demo-device', id: 'demo-device' }, canvas, finger,
            el('div', { class: 'demo-empty', id: 'demo-empty' }, icon('smart_display'), el('p', {}, 'Open een app of een apparaat rechts om te beginnen.')),
            el('div', { class: 'demo-busy', id: 'demo-busy', hidden: true }, el('span', {}, 'Bezig…')))),
        el('div', { class: 'demo-side', id: 'demo-side' })));
    dlg.addEventListener('close', () => { stopStream(); });
    new ResizeObserver(() => fit()).observe($('#demo-device'));
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
    document.body.append(dlg);
    wireCanvas();
  }

  async function open() {
    if (!S.workspace) return toast('Open eerst een project.');
    if (!dlg) build();
    if (S.saveTimer) await ctx.flushSave?.();
    st.result = null;
    try { st.data = await api('/api/demo/data'); } catch (e) { return toast(e.message, true); }
    st.dataset ??= st.data.datasets[0]?.id || null;
    st.meta = await api('/api/demo/status').catch(() => ({ open: false }));
    dlg.showModal();
    startStream();
    paint();
  }
  async function closeDialog() {
    if (st.meta.recording && !confirm('Er wordt opgenomen. Stoppen en de opname weggooien?')) return;
    clearInterval(st.timer);
    await api('/api/demo/session', { method: 'DELETE' }).catch(() => {});
    st.meta = { open: false };
    dlg.close();
  }

  // ---------- the live picture ----------
  function startStream() {
    stopStream();
    es = new EventSource('/api/demo/frames');
    let decoding = false;
    es.onmessage = ev => {
      if (decoding) return; // a slow machine skips pictures instead of falling behind
      decoding = true;
      const img = new Image();
      img.onload = () => { if (canvas.width !== img.naturalWidth) { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; } cx.drawImage(img, 0, 0); decoding = false; $('#demo-empty').hidden = true; };
      img.onerror = () => { decoding = false; };
      img.src = `data:image/${ev.data.startsWith('iVBOR') ? 'png' : 'jpeg'};base64,${ev.data}`; // a device sends PNG screenshots, a page JPEG frames
    };
    es.addEventListener('meta', ev => { const was = st.meta.open; st.meta = JSON.parse(ev.data); if (was !== st.meta.open || st.meta.open) paintStage(); paintRec(); });
  }
  function stopStream() { es?.close(); es = null; }

  // ---------- input: what happens on the picture goes to the app ----------
  function point(e) {
    const r = canvas.getBoundingClientRect(), [w, h] = st.meta.css || [390, 844];
    return [Math.max(0, Math.min(w, (e.clientX - r.left) / r.width * w)), Math.max(0, Math.min(h, (e.clientY - r.top) / r.height * h))];
  }
  function send(ev) {
    if (ev.type === 'move') { st.moves = ev; requestAnimationFrame(flush); return; }
    if (st.moves) { st.pending.push(st.moves); st.moves = null; }
    st.pending.push(ev);
    flush();
  }
  async function flush() {
    if (st.busy) return;
    if (st.moves) { st.pending.push(st.moves); st.moves = null; }
    if (!st.pending.length) return;
    st.busy = true;
    const events = st.pending.splice(0);
    try { await api('/api/demo/input', { method: 'POST', body: JSON.stringify({ events }) }); }
    catch (e) { toast(e.message, true); }
    st.busy = false;
    if (st.pending.length || st.moves) flush();
  }
  // What was done, counted live, from the same events (the recording's own log is what ends up in the video).
  const tally = (() => {
    let downAt = null;
    return ev => {
      if (!st.meta.recording) return;
      if (ev.type === 'down') downAt = { x: ev.x, y: ev.y, t: performance.now() };
      else if (ev.type === 'up' && downAt) { const moved = Math.hypot(ev.x - downAt.x, ev.y - downAt.y) > 14; st.counts[moved ? 'swipe' : 'tap']++; downAt = null; paintCounts(); }
      else if (ev.type === 'wheel') { st.counts.swipe += ev.fresh ? 1 : 0; }
      else if (ev.type === 'key' && ev.key?.length === 1) { st.counts.type = st.counts.type || 1; paintCounts(); }
    };
  })();
  function wireCanvas() {
    let down = false, lastWheel = 0;
    canvas.addEventListener('pointerdown', e => { if (!st.meta.open || e.button) return; e.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); down = true; finger.classList.add('down'); const [x, y] = point(e); send({ type: 'down', x, y }); tally({ type: 'down', x, y }); });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = point(e);
      finger.style.left = `${e.clientX - canvas.parentElement.getBoundingClientRect().left}px`; finger.style.top = `${e.clientY - canvas.parentElement.getBoundingClientRect().top}px`; finger.hidden = false;
      if (st.meta.open && (down || st.meta.mobile === false)) send({ type: 'move', x, y });
    });
    canvas.addEventListener('pointerup', e => { if (!down) return; down = false; finger.classList.remove('down'); const [x, y] = point(e); send({ type: 'up', x, y }); tally({ type: 'up', x, y }); });
    canvas.addEventListener('pointercancel', () => { down = false; finger.classList.remove('down'); });
    canvas.addEventListener('pointerleave', () => { finger.hidden = true; });
    canvas.addEventListener('wheel', e => {
      if (!st.meta.open) return;
      e.preventDefault();
      const [x, y] = point(e), now = performance.now();
      send({ type: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY });
      tally({ type: 'wheel', fresh: now - lastWheel > 300 }); lastWheel = now; paintCounts();
    }, { passive: false });
    canvas.addEventListener('keydown', e => {
      if (!st.meta.open || e.metaKey || (e.ctrlKey && e.key.length === 1)) return;
      if (e.key.length !== 1 && !['Enter', 'Backspace', 'Delete', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      send({ type: 'key', key: e.key, code: e.code, keyCode: e.keyCode, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
      tally({ type: 'key', key: e.key }); paintCounts();
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------- painting ----------
  function paint() { paintStage(); paintSide(); paintRec(); }
  // The picture as big as the space allows, in the shape of the device.
  function fit() {
    const dev = $('#demo-device'), [w, h] = st.meta.css || [390, 844];
    const room = [dev.clientWidth - 24, dev.clientHeight - 24];
    if (room[0] < 50 || room[1] < 50) return;
    const k = Math.min(room[0] / w, room[1] / h);
    canvas.style.width = `${Math.floor(w * k)}px`; canvas.style.height = `${Math.floor(h * k)}px`;
  }
  function paintStage() {
    const m = st.meta;
    const dev = $('#demo-device');
    dev.className = `demo-device${m.source === 'android' ? ' android' : ''}${m.mobile === false ? ' desktop' : ''}${m.open ? ' open' : ''}`;
    fit();
    $('#demo-empty').hidden = !!m.open;
    $('#demo-sub').textContent = m.open ? (m.source === 'android' ? m.name || 'Android' : m.url || '') : 'Bedien je app hier en neem elke tik en swipe op.';
    const nav = $('#demo-nav');
    if (!m.open) return nav.replaceChildren();
    if (m.source === 'android') {
      nav.replaceChildren(
        el('button', { class: 'ghost icon', title: 'Terug', onclick: () => input({ type: 'button', name: 'back' }) }, icon('arrow_back')),
        el('button', { class: 'ghost icon', title: 'Home', onclick: () => input({ type: 'button', name: 'home' }) }, icon('circle')),
        el('button', { class: 'ghost icon', title: 'Recente apps', onclick: () => input({ type: 'button', name: 'recents' }) }, icon('crop_square')),
        el('span', { class: 'muted' }, m.name || 'Android'));
      return;
    }
    const url = el('input', { class: 'demo-url', value: m.url || '', spellcheck: false });
    url.addEventListener('keydown', e => { if (e.key === 'Enter') nav$('go', url.value.trim()); });
    nav.replaceChildren(
      el('button', { class: 'ghost icon', title: 'Terug', onclick: () => nav$('back') }, icon('arrow_back')),
      el('button', { class: 'ghost icon', title: 'Vooruit', onclick: () => nav$('forward') }, icon('arrow_forward')),
      el('button', { class: 'ghost icon', title: 'Herladen', onclick: () => nav$('reload') }, icon('refresh')),
      url);
  }
  const input = ev => api('/api/demo/input', { method: 'POST', body: JSON.stringify({ events: [ev] }) }).catch(e => toast(e.message, true));
  const nav$ = (action, url) => api('/api/demo/navigate', { method: 'POST', body: JSON.stringify({ action, url }) }).catch(e => toast(e.message, true));

  const section = (title, ...kids) => el('section', { class: 'demo-sec' }, el('h3', {}, title), ...kids);
  const dropdown = (options, value, onchange) => { const s = el('select', {}, ...options.map(([v, t]) => el('option', { value: v }, t))); s.value = value; s.onchange = () => onchange(s.value); return s; };

  function paintSide() {
    const side = $('#demo-side');
    if (st.result) return side.replaceChildren(reviewPanel());
    const keep = side.scrollTop;
    side.replaceChildren(sourcePanel(), dataPanel(), recordPanel());
    side.scrollTop = keep;
    paintCounts();
  }

  // ---- source ----
  let devices = null, layout = null, quality = 'standard', url = '';
  function sourcePanel() {
    layout ??= ctx.layoutOf?.() || 'phone';
    const tabs = el('div', { class: 'seg' },
      el('button', { class: st.source === 'web' ? 'on' : '', onclick: () => { st.source = 'web'; paintSide(); } }, icon('language'), 'Webapp'),
      el('button', { class: st.source === 'android' ? 'on' : '', onclick: () => { st.source = 'android'; loadDevices(); paintSide(); } }, icon('android'), 'Android'));
    const open = st.meta.open;
    const body = [];
    if (st.source === 'web') {
      url ||= st.data.apps[0]?.url || '';
      const input = el('input', { value: url, placeholder: 'http://localhost:3000', list: 'demo-apps', spellcheck: false });
      input.oninput = () => (url = input.value);
      const known = el('datalist', { id: 'demo-apps' }, ...st.data.apps.map(a => el('option', { value: a.url }, a.name)));
      body.push(
        el('label', { class: 'field' }, el('span', {}, 'Adres van je app'), input, known),
        el('div', { class: 'field-row' },
          el('label', { class: 'field' }, el('span', {}, 'Apparaat'), dropdown(Object.entries(S.layouts || {}), layout, v => (layout = v))),
          el('label', { class: 'field' }, el('span', {}, 'Scherpte'), dropdown([['standard', 'Standaard'], ['high', 'Hoog (groter bestand)']], quality, v => (quality = v)))),
        el('div', { class: 'insp-actions' },
          el('button', { class: 'primary', onclick: openWeb }, icon('play_arrow'), open ? 'Opnieuw openen' : 'Openen'),
          el('button', { class: 'ghost', title: 'Onthoud dit adres', onclick: () => rememberApp(input.value.trim()) }, icon('bookmark_add'))),
        el('p', { class: 'hint' }, 'Je app draait in een eigen Chrome-venster op de schermgrootte van het apparaat. Klik, sleep om te swipen, scroll met het muiswiel en typ zoals op een telefoon.'));
    } else {
      body.push(devicesPanel());
    }
    return section('Bron', tabs, ...body);
  }
  function devicesPanel() {
    if (!devices) return el('p', { class: 'hint' }, 'Apparaten zoeken…');
    if (!devices.adb) return el('p', { class: 'hint warn-text' }, 'adb niet gevonden. Installeer de Android platform-tools (of Android Studio) en zet het pad bij Instellingen.');
    const list = devices.devices;
    const chosen = ctx.demoSerial && list.some(d => d.serial === ctx.demoSerial) ? ctx.demoSerial : list.find(d => d.state === 'device')?.serial || list[0]?.serial || '';
    ctx.demoSerial = chosen;
    return [
      list.length
        ? el('label', { class: 'field' }, el('span', {}, 'Apparaat'), dropdown(list.map(d => [d.serial, `${d.name}${d.state !== 'device' ? ` (${d.state})` : ''}`]), chosen, v => (ctx.demoSerial = v)))
        : el('p', { class: 'hint' }, 'Geen apparaat gevonden. Sluit een telefoon aan met USB-foutopsporing aan, of start een emulator.'),
      el('div', { class: 'insp-actions' },
        el('button', { class: 'primary', disabled: !list.length, onclick: openAndroid }, icon('play_arrow'), 'Verbinden'),
        el('button', { class: 'ghost', title: 'Opnieuw zoeken', onclick: loadDevices }, icon('refresh'))),
      el('p', { class: 'hint' }, 'Bediening loopt via adb: een tik of swipe gebeurt zodra je loslaat. Opnames duren maximaal 3 minuten.')
    ];
  }
  async function loadDevices() { devices = null; paintSide(); try { devices = await api('/api/demo/devices'); } catch (e) { devices = { adb: false, devices: [] }; } paintSide(); }
  async function withBusy(text, fn) {
    const b = $('#demo-busy'); b.querySelector('span').textContent = text; b.hidden = false;
    try { return await fn(); } catch (e) { toast(e.message, true); } finally { b.hidden = true; }
  }
  const openWeb = () => withBusy('App openen…', async () => { st.meta = await api('/api/demo/open', { method: 'POST', body: JSON.stringify({ source: 'web', url, layout, quality, dataset: st.dataset }) }); paint(); canvas.focus({ preventScroll: true }); });
  const openAndroid = () => withBusy('Verbinden…', async () => { st.meta = await api('/api/demo/open', { method: 'POST', body: JSON.stringify({ source: 'android', serial: ctx.demoSerial, layout: layout || 'phone' }) }); paint(); canvas.focus({ preventScroll: true }); });
  async function rememberApp(u) {
    if (!/^https?:\/\//i.test(u)) return toast('Geef eerst een adres dat met http:// of https:// begint.', true);
    if (st.data.apps.some(a => a.url === u)) return toast('Dit adres is al onthouden.');
    const name = prompt('Naam voor deze app', new URL(u).host);
    if (!name) return;
    st.data.apps.push({ id: `app-${Date.now().toString(36)}`, name, url: u, layout });
    st.data = await api('/api/demo/data', { method: 'PUT', body: JSON.stringify(st.data) });
    paintSide();
  }

  // ---- demo data ----
  function dataPanel() {
    const ds = st.data.datasets.find(d => d.id === st.dataset) || st.data.datasets[0];
    const chips = ds ? Object.entries(ds.fields).filter(([, v]) => v !== '').map(([k, v]) => el('button', {
      class: 'demo-chip', title: `Typ "${v}" in het veld waar je op hebt geklikt`, onclick: () => fill({ text: v })
    }, el('small', {}, fieldLabels[k] || k), el('b', {}, k === 'password' ? '••••••••' : v))) : [];
    return section('Demo-data',
      el('div', { class: 'field-row demo-ds' },
        dropdown(st.data.datasets.map(d => [d.id, d.name]), ds?.id || '', v => { st.dataset = v; paintSide(); }),
        el('button', { class: 'ghost', title: 'Gegevens bewerken', onclick: () => editDataset(ds) }, icon('edit'), 'Bewerken')),
      el('div', { class: 'demo-chips' }, ...(chips.length ? chips : [el('p', { class: 'hint' }, 'Deze dataset is leeg.')])),
      el('div', { class: 'insp-actions' },
        el('button', { disabled: !st.meta.open, onclick: () => fill({ mode: 'all' }) }, icon('edit_note'), 'Vul alle velden in'),
        el('button', { class: 'ghost', disabled: !st.meta.open, title: 'Vul het veld in waar je op hebt geklikt met de bijpassende gegevens', onclick: () => fill({ mode: 'focused' }) }, icon('input'), 'Dit veld')),
      el('p', { class: 'hint' }, 'Klik een gegeven om het te typen in het veld dat open staat. Of laat alle lege velden invullen: het tikken en typen komt gewoon in je opname.'));
  }
  async function fill(extra) {
    if (!st.meta.open) return toast('Open eerst een app.');
    try { await api('/api/demo/fill', { method: 'POST', body: JSON.stringify({ dataset: st.dataset, ...extra }) }); }
    catch (e) { toast(e.message, true); }
  }
  // A dataset as rows of name and value; storage (localStorage and the like) as JSON for whoever needs it.
  function editDataset(ds) {
    const d = ds ? JSON.parse(JSON.stringify(ds)) : { id: `set-${Date.now().toString(36)}`, name: 'Nieuwe persona', fields: {} };
    const side = $('#demo-side');
    const rows = el('div', { class: 'demo-rows' });
    const addRow = (k = '', v = '') => {
      const key = el('input', { value: k, placeholder: 'veld (bijv. email)', list: 'demo-keys' }), val = el('input', { value: v, placeholder: 'waarde' });
      const row = el('div', { class: 'demo-row' }, key, val, el('button', { class: 'ghost icon', title: 'Verwijderen', onclick: () => row.remove() }, icon('close')));
      row.get = () => [key.value.trim(), val.value];
      rows.append(row);
    };
    Object.entries(d.fields).forEach(([k, v]) => addRow(k, v));
    if (!Object.keys(d.fields).length) addRow('email', '');
    const name = el('input', { value: d.name });
    const storage = el('textarea', { rows: 4, spellcheck: false, placeholder: '{ "local": { "token": "demo" }, "cookies": [{ "name": "a", "value": "b" }] }' }, d.storage ? JSON.stringify(d.storage, null, 2) : '');
    const save = async () => {
      d.name = name.value.trim() || d.id;
      d.fields = Object.fromEntries([...rows.children].map(r => r.get()).filter(([k]) => k));
      if (storage.value.trim()) { try { d.storage = JSON.parse(storage.value); } catch { return toast('De opslag is geen geldige JSON.', true); } } else delete d.storage;
      const i = st.data.datasets.findIndex(x => x.id === d.id);
      if (i < 0) st.data.datasets.push(d); else st.data.datasets[i] = d;
      st.data = await api('/api/demo/data', { method: 'PUT', body: JSON.stringify(st.data) });
      st.dataset = d.id; paintSide();
    };
    const del = async () => {
      if (st.data.datasets.length < 2 || !confirm(`"${d.name}" verwijderen?`)) return;
      st.data.datasets = st.data.datasets.filter(x => x.id !== d.id);
      st.data = await api('/api/demo/data', { method: 'PUT', body: JSON.stringify(st.data) });
      st.dataset = st.data.datasets[0].id; paintSide();
    };
    side.replaceChildren(section('Dataset bewerken',
      el('label', { class: 'field' }, el('span', {}, 'Naam'), name),
      el('datalist', { id: 'demo-keys' }, ...Object.keys(fieldLabels).map(k => el('option', { value: k }, fieldLabels[k]))),
      el('p', { class: 'hint' }, 'De veldnamen email, naam, voornaam, wachtwoord, telefoon en meer worden herkend in Nederlandse en Engelse formulieren. Eigen namen (bijvoorbeeld klantnummer) werken als ze in het label of de naam van het veld voorkomen.'),
      rows,
      el('button', { class: 'ghost', onclick: () => addRow() }, icon('add'), 'Veld toevoegen'),
      el('details', { class: 'demo-storage', open: !!d.storage }, el('summary', {}, 'Opslag van de app (localStorage, sessionStorage, cookies)'), el('p', { class: 'hint' }, 'Wordt in de app gezet voordat hij laadt, zodat je bijvoorbeeld al ingelogd begint. Alleen bij webapps.'), storage),
      el('div', { class: 'insp-actions' },
        el('button', { class: 'primary', onclick: save }, icon('check'), 'Opslaan'),
        el('button', { class: 'ghost', onclick: paintSide }, 'Annuleren'),
        el('button', { class: 'ghost danger', disabled: st.data.datasets.length < 2, onclick: del }, icon('delete')))));
  }

  // ---- recording ----
  function recordPanel() {
    const rec = st.meta.recording;
    return section('Opnemen',
      el('button', { class: `demo-recbtn${rec ? ' on' : ''}`, disabled: !st.meta.open, onclick: rec ? stop : start }, el('i'), rec ? 'Stop opname' : 'Opname starten'),
      el('p', { class: 'demo-counts', id: 'demo-counts' }),
      el('p', { class: 'hint' }, rec ? 'Alles wat je nu doet komt in de opname, met de tijd waarop je het deed.' : 'Je tikken, swipes en getypte tekst worden vastgelegd en komen als tikken in je video.'));
  }
  function paintCounts() {
    const n = $('#demo-counts'); if (!n) return;
    const c = st.counts, parts = [c.tap && `${c.tap} tik${c.tap > 1 ? 'ken' : ''}`, c.swipe && `${c.swipe} swipe${c.swipe > 1 ? 's' : ''}`, c.type && 'getypt'].filter(Boolean);
    n.textContent = st.meta.recording ? (parts.join(' · ') || 'Nog niets gedaan') : '';
  }
  function paintRec() {
    const on = !!st.meta.recording;
    $('#demo-rec').hidden = !on;
    clearInterval(st.timer);
    if (on) {
      const t0 = st.meta.since || Date.now();
      const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); $('#demo-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
      tick(); st.timer = setInterval(tick, 500);
    }
    if (!st.result) paintSide();
  }
  async function start() {
    st.counts = { tap: 0, swipe: 0, type: 0 };
    try { await api('/api/demo/record', { method: 'POST', body: JSON.stringify({ action: 'start' }) }); st.meta.recording = true; st.meta.since = Date.now(); paintRec(); paintCounts(); }
    catch (e) { toast(e.message, true); }
  }
  async function stop() {
    await withBusy('Opname verwerken…', async () => {
      st.result = await api('/api/demo/record', { method: 'POST', body: JSON.stringify({ action: 'stop' }) });
      st.meta.recording = false; clearInterval(st.timer); $('#demo-rec').hidden = true;
      await loadState(); // the clip is in the media pool now
      st.shift = st.result.sync || 0; st.useTaps = true;
      paintSide();
    });
  }

  // ---- what came out ----
  function reviewPanel() {
    const r = st.result, kinds = r.gestures.reduce((m, g) => ((m[g.kind] = (m[g.kind] || 0) + 1), m), {});
    video = el('video', { class: 'demo-preview', src: `/assets/clips/${encodeURIComponent(r.clip)}`, controls: true, muted: true, loop: true, playsInline: true });
    const shift = el('input', { type: 'number', step: 0.05, value: st.shift });
    shift.oninput = () => (st.shift = +shift.value || 0);
    const useTaps = el('input', { type: 'checkbox', checked: st.useTaps });
    useTaps.onchange = () => (st.useTaps = useTaps.checked);
    const summary = [kinds.tap && `${kinds.tap} tik${kinds.tap > 1 ? 'ken' : ''}`, kinds.swipe && `${kinds.swipe} swipe${kinds.swipe > 1 ? 's' : ''}`, kinds.hold && `${kinds.hold} lang indrukken`, kinds.type && `${kinds.type} keer getypt`].filter(Boolean).join(' · ');
    return section('Opname klaar',
      video,
      el('p', { class: 'demo-summary' }, `${r.dur.toFixed(1)} s · ${summary || 'geen gebaren'}`),
      el('label', { class: 'check' }, useTaps, 'Tikken en swipes meenemen als animatie'),
      el('label', { class: 'field' }, el('span', {}, 'Tikken later (+) of eerder (−), in seconden'), shift),
      el('p', { class: 'hint' }, r.source === 'android' ? 'Bij Android loopt het beeld een fractie achter op de tik. Speel de opname af en pas dit aan tot de tik precies valt als het scherm reageert.' : 'De tikken zitten op de tijd waarop je ze deed. Meestal hoef je hier niets aan te passen.'),
      el('div', { class: 'insp-actions' },
        el('button', { class: 'primary', onclick: () => apply(r) }, icon('add'), 'Toevoegen aan deze video'),
        el('button', { class: 'ghost', onclick: () => { st.result = null; paintSide(); } }, icon('replay'), 'Nog een opname'),
        el('button', { class: 'ghost', onclick: closeDialog }, 'Alleen bewaren')),
      el('p', { class: 'hint' }, `De opname staat als ${r.clip} bij je media.`));
  }

  // Puts the clip in the video at the playhead, with its taps (placed for the video's own layout), and makes the video
  // long enough for it.
  async function apply(r) {
    if (!V()) return toast('Open eerst een video.');
    const start = round(Math.max(0, S.t)), layoutId = ctx.layoutOf?.() || 'phone';
    const L = { inset: S.insets?.[layoutId] || [0, 0, 1], screen: S.screens?.[layoutId] || [616, 1334] };
    const taps = st.useTaps ? tapsFromGestures(r.gestures, insetFor(L, r.css), { shift: start + st.shift }) : [];
    commit(v => {
      v.clips.push({ src: r.clip, start, dur: round(r.dur), media: 0 });
      v.clips.sort((a, b) => a.start - b.start);
      const endsAt = start + r.dur;
      if (endsAt > (v.end ?? 12.6) - 0.2) { const tail = (v.dur ?? 15) - (v.end ?? 12.6); v.end = round(endsAt + 0.4); v.dur = round(v.end + tail); }
      v.taps = [...(v.taps || []), ...taps];
    });
    const i = V().clips.findIndex(c => c.src === r.clip && c.start === start);
    renderAll(); select({ kind: 'clips', i }, false);
    const swipes = taps.filter(t => t.x2 != null).length;
    toast(`Opname toegevoegd${taps.length ? ` met ${taps.length - swipes} tikken${swipes ? ` en ${swipes} swipes` : ''}` : ''}`);
    st.result = null;
    closeDialog();
  }
  return { open };
}
