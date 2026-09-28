// Motion Studio editor. Edits specs/<id>.json (the same format build.mjs reads) with a live preview.
import { captionStyles, captionStyleHints, captionStyle, splitSub, parseSubtitles } from '/lib/captions.mjs';
import { musicDefaults, musicMix, speechSpans } from '/lib/audio.mjs';
import { autoDropdowns, dropdownExtras, menubar } from '/ui/widgets.js';
import { installTranslations, tr } from '/ui/i18n.js';
const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
};
const icon = name => el('span', { class: 'ms' }, name);
const clone = o => JSON.parse(JSON.stringify(o));
const round = x => Math.round(x * 100) / 100;
const plain = s => String(s || '').replace(/\*/g, '');
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const FPS = 30;

const CHIP_COLORS = { blue: ['#b8c7ff', '#17244a'], violet: ['#d7baff', '#35214b'], lime: ['#c1ec8a', '#263618'], orange: ['#ffb77d', '#4a2a0c'] };
const ICONS = ['bolt', 'emoji_events', 'timer', 'trending_up', 'monitoring', 'local_fire_department', 'fitness_center', 'menu_book', 'group_add', 'notifications', 'sync', 'drag_indicator', 'devices', 'front_hand', 'check_circle', 'speed', 'task_alt', 'event', 'edit_calendar', 'school', 'favorite', 'star', 'celebration', 'rocket_launch', 'lightbulb', 'insights', 'bar_chart', 'show_chart', 'timeline', 'schedule', 'alarm', 'calendar_month', 'today', 'person', 'groups', 'chat', 'forum', 'thumb_up', 'share', 'download', 'lock', 'verified', 'workspace_premium', 'military_tech', 'sports_gymnastics', 'directions_run', 'self_improvement', 'restaurant', 'water_drop', 'bedtime', 'scale', 'straighten', 'repeat', 'playlist_add_check', 'checklist', 'add_circle', 'edit', 'touch_app', 'swipe', 'smartphone', 'language', 'android', 'wifi_off', 'offline_bolt', 'auto_awesome', 'psychology', 'target', 'flag', 'priority_high', 'warning', 'info', 'help', 'block', 'close', 'done_all', 'history', 'update', 'bookmark', 'note_alt', 'description', 'quiz', 'translate', 'calculate', 'science', 'public', 'palette'];
const KOKORO = [['am_michael', 'Michael (EN, man)'], ['am_adam', 'Adam (EN, man)'], ['af_heart', 'Heart (EN, vrouw)'], ['af_nova', 'Nova (EN, vrouw)'], ['af_sky', 'Sky (EN, vrouw)'], ['bm_george', 'George (UK, man)'], ['bf_emma', 'Emma (UK, vrouw)'], ['bf_isabella', 'Isabella (UK, vrouw)']];
const PIPER_LABELS = { 'nl_NL-pim-medium': 'Pim (NL, man)', 'nl_NL-ronnie-medium': 'Ronnie (NL, man)', 'nl_BE-nathalie-medium': 'Nathalie (BE, vrouw)' };

const S = {
  list: [], clips: [], audio: [], brands: [], fonts: [], logos: [], layouts: {}, tts: { piper: [] }, workspace: null, settings: {},
  spec: null, id: null, sel: null, t: 0, pps: 70,
  pf: (() => { try { return localStorage.getItem('ms-pf') || '9:16'; } catch { return '9:16'; } })(), // preview format
  history: [], future: [], lastKey: null, lastKeyAt: 0,
  clipDur: {}, clipSize: {}, audioDur: {}, beats: {}, multi: null, pv: 0, player: null, playing: false
};

// ---------- api ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), err ? 6000 : 2600);
}

async function loadState() {
  applyState(await api('/api/state'));
}
function applyState(s) {
  Object.assign(S, { workspace: s.workspace, settings: s.settings, layouts: s.layouts, screens: s.screens, devs: s.devs, formats: s.formats, defaultTheme: s.defaultTheme, defaultChipColors: s.defaultChipColors });
  $('#project-name').textContent = s.workspace?.name || 'Geen project';
  if (!s.workspace) return;
  Object.assign(S, { list: s.videos, clips: s.clips, audio: s.audio, brands: s.brands, fonts: s.fonts, logos: s.logos, tts: s.tts });
  const sel = $('#video-select');
  sel.replaceChildren(...S.list.map(v => el('option', { value: v.id, 'data-hint': v.overline || '' }, v.id)));
  if (S.id) sel.value = S.id;
  renderLibrary();
  renderFormatBar();
}

async function openVideo(id) {
  if (S.tapMode) setTapMode(false);
  if (S.saveTimer) await flushSave();
  S.spec = await api(`/api/videos/${id}`);
  S.id = id; S.sel = null; S.history = []; S.future = []; S.t = 0;
  localStorage.setItem(`ms-last:${S.workspace.path}`, id);
  $('#video-select').value = id;
  document.title = `${id} · Motion Studio`;
  renderAll();
  reloadPreview();
}

// ---------- spec helpers ----------
const V = () => S.spec;
const DUR = () => V().dur ?? 15;
const END = () => V().end ?? 12.6;
function ensureLists(v = V()) {
  for (const k of ['heads', 'clips', 'chips', 'zooms', 'taps']) v[k] ??= [];
  if (isDual(v)) v.clips2 ??= [];
  v.vo ??= { lines: [] }; v.vo.lines ??= [];
  v.subs ??= [];
}
const layoutOf = (v = V()) => S.layouts[v.layout] ? v.layout : v.dual ? 'dual' : 'phone';
const isDual = (v = V()) => layoutOf(v) === 'dual';
const isImage = src => /\.(png|jpe?g|webp|gif)$/i.test(src || '');
const brandOf = (v = V()) => S.brands.find(b => b.id === v?.brand) || S.brands.find(b => b.id === S.workspace?.defaultBrand) || S.brands[0] || { id: 'none', name: 'Brand', theme: {} };
const chipColors = () => ({ ...(S.defaultChipColors || CHIP_COLORS), ...(brandOf().chipColors || {}) });
const listOf = kind => ({ head: V().heads, clips: V().clips, clips2: V().clips2, chips: V().chips, zoom: V().zooms, vo: V().vo.lines, sub: V().subs, tap: V().taps })[kind];

// Every change goes through commit: snapshot for undo, then save + preview refresh.
// quiet: the change is already visible in the preview (moved by hand there), so save without rebuilding it.
function commit(fn, { key = null, refresh = 'all', quiet = false } = {}) {
  const now = Date.now();
  if (!(key && key === S.lastKey && now - S.lastKeyAt < 1500)) { S.history.push(clone(V())); if (S.history.length > 200) S.history.shift(); }
  S.lastKey = key; S.lastKeyAt = now;
  S.future = [];
  fn(V());
  ensureLists();
  if (refresh === 'all') renderAll(); else renderTimeline();
  scheduleSave(quiet);
}
function undo() { if (!S.history.length) return; S.future.push(clone(V())); S.spec = S.history.pop(); afterHistory(); }
function redo() { if (!S.future.length) return; S.history.push(clone(V())); S.spec = S.future.pop(); afterHistory(); }
function afterHistory() { S.lastKey = null; if (S.sel && !selItem()) S.sel = null; renderAll(); scheduleSave(); }

function scheduleSave(quiet = false) {
  if (!quiet) S.previewDirty = true;
  $('#save-state').textContent = 'Wijzigingen…'; $('#save-state').className = 'busy';
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(flushSave, 350);
}
async function flushSave() {
  clearTimeout(S.saveTimer); S.saveTimer = null;
  try {
    await api(`/api/videos/${S.id}`, { method: 'PUT', body: JSON.stringify(V()) });
    $('#save-state').textContent = 'Opgeslagen'; $('#save-state').className = 'muted';
    // In tap mode new taps show as markers; the preview is rebuilt once the mode ends.
    if (S.previewDirty && !S.tapMode) { S.previewDirty = false; reloadPreview(); }
  } catch (e) { $('#save-state').textContent = 'Opslaan mislukt'; $('#save-state').className = 'err'; toast(e.message, true); }
}

// ---------- preview (two iframes, swapped when the new one is ready, so edits don't flash) ----------
function fitStage() {
  const box = $('#stage-fit');
  const F = S.formats?.[S.pf] || { w: 1080, h: 1920 };
  const s = Math.min((box.clientHeight - 8) / F.h, (box.clientWidth - 20) / F.w);
  S.scale = s;
  $('#frame-box').style.cssText = `width:${Math.round(F.w * s)}px;height:${Math.round(F.h * s)}px`;
  document.querySelectorAll('.pv').forEach(f => (f.style.cssText = `width:${F.w}px;height:${F.h}px;transform:scale(${s})`));
}
function reloadPreview() {
  const n = ++S.pv;
  const back = $('.pv.back');
  $('#pv-loading').hidden = false;
  back.onload = async () => {
    const w = back.contentWindow;
    for (let i = 0; i < 100 && !w.__player; i++) await new Promise(r => setTimeout(r, 30));
    if (n !== S.pv) return;
    if (!w.__player) { $('#pv-loading').textContent = 'Preview-fout (zie console)'; return; }
    await w.document.fonts.ready;
    const wasPlaying = S.playing;
    S.player?.pause();
    const p = w.__player;
    p.seek(Math.min(S.t, p.duration));
    p.onChange((t, playing) => { S.t = t; S.playing = playing; onTime(); });
    wirePreviewDom(w.document);
    const front = $('.pv.front');
    front.classList.replace('front', 'back'); back.classList.replace('back', 'front');
    front.src = 'about:blank';
    S.player = p;
    $('#pv-loading').hidden = true;
    if (wasPlaying) p.play();
  };
  back.src = `/preview/${S.id}/?v=${n}&f=${encodeURIComponent(S.pf)}`;
}
const seek = t => { S.t = Math.max(0, Math.min(DUR(), t)); if (S.player) S.player.seek(S.t); else onTime(); };
const togglePlay = () => S.player && (S.player.playing ? S.player.pause() : S.player.play());

function onTime() {
  if (!V()) return;
  if ((S.tapMode || S.sel?.kind === 'tap') && Math.abs((S.lastMarkT ?? -9) - S.t) > 0.1) { S.lastMarkT = S.t; drawTapMarks(); }
  $('#timecode').textContent = `${fmt(S.t)} / ${fmt(DUR())}`;
  $('#btn-play').firstChild.textContent = S.playing ? 'pause' : 'play_arrow';
  $('#tl-playhead').style.left = `${S.t * S.pps}px`;
  if (S.playing) {
    const sc = $('#tl-scroll'), x = S.t * S.pps;
    const lw = 128;
    if (x + lw > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 200);
  }
}

// Drag callouts directly in the preview; click headlines to select them.
function wirePreviewDom(doc) {
  const style = doc.createElement('style');
  style.textContent = '.ms-pick .phone { cursor: crosshair; } .chip { cursor: grab; } .chip.ms-sel { outline: 4px solid #fff; outline-offset: 6px; } h1.head { cursor: pointer; } .cap-bg { cursor: ns-resize; } #captions.ms-sel .cap-bg { outline: 4px dashed #fffa; outline-offset: 12px; }' +
    '.ms-tapmark { position: absolute; width: 0; height: 0; pointer-events: auto; z-index: 30; cursor: grab; transform: scale(var(--mk, 1)); }' +
    '.ms-tapmark::before { content: ""; position: absolute; left: -30px; top: -30px; width: 60px; height: 60px; border-radius: 50%; border: 5px solid #ffffffb0; background: #0006; box-shadow: 0 4px 14px #0008; }' +
    '.ms-tapmark b { position: absolute; left: -30px; top: -30px; width: 60px; height: 60px; display: grid; place-items: center; font: 800 26px system-ui, sans-serif; color: #fff; }' +
    '.ms-tapmark small { position: absolute; left: 36px; top: -14px; padding: 2px 8px; border-radius: 8px; background: #000b; color: #fff; font: 700 20px system-ui, sans-serif; white-space: nowrap; }' +
    '.ms-tapmark:not(.near):not(.sel) { opacity: .45; }' +
    '.ms-tapmark.near::before { border-color: #fff; }' +
    '.ms-tapmark.sel::before { border-color: #ffb77d; box-shadow: 0 0 0 6px #ffb77d55, 0 4px 14px #0008; }' +
    '.ms-tapmark.drag { cursor: grabbing; } .ms-tapmode #phone { cursor: crosshair; }';
  doc.head.append(style);
  markPreviewSelection(doc);
  drawTapMarks(doc);
  doc.addEventListener('pointerdown', e => {
    // Invisible layers (the end card, the top fade, callouts that aren't showing yet) lie on top of the device,
    // so the event target is often one of those. Look through every layer under the pointer instead and take the
    // first visible match.
    const hits = doc.elementsFromPoint(e.clientX, e.clientY);
    const shown = n => { for (let x = n; x && x !== doc.body; x = x.parentElement) if (+getComputedStyle(x).opacity < 0.05) return false; return true; };
    const pick = sel => { for (const n of hits) { const m = n.closest(sel); if (m && shown(m)) return m; } return null; };
    // Tap markers: drag to move (live, no rebuild).
    const mark = pick('.ms-tapmark');
    if (mark) return dragTapMark(doc, mark, e);
    // Tap mode: a click on the device adds a tap there, at the playhead; playback keeps running.
    if (S.tapMode && pick('#phone')) { e.preventDefault(); return placeTap(doc, e); }
    const chip = pick('.chip');
    if (chip) {
      e.preventDefault();
      const i = +chip.id.slice(4);
      select({ kind: 'chips', i }, false);
      S.player.pause();
      const at = chipAt(V().chips[i]), x0 = e.clientX, y0 = e.clientY, ox = at.x, oy = at.y;
      const k = +doc.getElementById('stage')?.dataset.scale || 1; // other formats draw the stage scaled
      let moved = false;
      const move = ev => {
        moved = true;
        chip.style.left = `${Math.round(ox + (ev.clientX - x0) / k)}px`;
        chip.style.top = `${Math.round(oy + (ev.clientY - y0) / k)}px`;
      };
      const up = ev => {
        doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up);
        if (moved) commit(v => setChipPos(v, i, Math.round(ox + (ev.clientX - x0) / k), Math.round(oy + (ev.clientY - y0) / k)), { quiet: true });
      };
      doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
      return;
    }
    // Captions: hidden groups overlap the visible one, so hit-test the visible group's box.
    const cap = [...doc.querySelectorAll('#captions .cap')].find(c => {
      if (+getComputedStyle(c).opacity < 0.05) return false;
      const r = c.firstElementChild.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (cap) {
      e.preventDefault();
      S.player.pause();
      const j = V().subs.findIndex(s => S.t >= s.t && S.t < s.out);
      if (j >= 0) select({ kind: 'sub', i: j }, false);
      const box = doc.getElementById('captions'), y0 = e.clientY, oy = capY();
      const ck = +box.dataset.scale || 1;
      const y = ev => Math.round(Math.max(100, Math.min(1850, oy + (ev.clientY - y0) / ck)) / 5) * 5;
      let moved = false;
      const move = ev => { moved = true; box.style.top = `${y(ev) * ck}px`; };
      const up = ev => {
        doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up);
        if (moved) commit(v => setCapY(v, y(ev)), { quiet: true });
      };
      doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
      return;
    }
    const head = pick('h1.head');
    if (head) { const idx = sortedHeads().findIndex(h => h.i === +head.id.slice(1)); if (idx >= 0) select({ kind: 'head', i: +head.id.slice(1) }, false); return; }
    if (S.t >= END() && pick('#endcard')) return select({ kind: 'end', i: 0 }, false);
    const phone = pick('.phone');
    // With a zoom selected, a click on the device picks its focus point (mapped back through the current zoom).
    // With a tap selected, a click on the (first) device moves it there.
    if (phone && S.sel?.kind === 'tap') {
      if (phone.id !== 'phone') return toast('Tikken staan op de linker telefoon.');
      const [x, y] = devicePoint(doc, e), i = S.sel.i;
      moveTapLive(doc, i, x, y);
      commit(v => { v.taps[i].x = x; v.taps[i].y = y; }, { quiet: true });
      return;
    }
    if (phone && S.sel?.kind === 'zoom') {
      const R = phone.querySelector('.phone-zoom').getBoundingClientRect();
      const fx = Math.round(phone.offsetLeft + (e.clientX - R.left) * phone.offsetWidth / R.width);
      const fy = Math.round(phone.offsetTop + (e.clientY - R.top) * phone.offsetHeight / R.height);
      const i = S.sel.i;
      commit(v => { v.zooms[i].fx = fx; v.zooms[i].fy = fy; });
      return toast('Focuspunt gezet');
    }
    if (phone) {
      const kind = phone.id === 'phone2' ? 'clips2' : 'clips';
      const i = (listOf(kind) || []).findIndex(c => S.t >= c.start && S.t < c.start + c.dur);
      if (i >= 0) select({ kind, i }, false);
    }
  });
  doc.addEventListener('keydown', onKey);
  // After a click in the preview the clipboard shortcuts land in its document; hand them to the editor.
  for (const type of ['copy', 'cut', 'paste']) doc.addEventListener(type, e => { e.preventDefault(); document.dispatchEvent(new Event(type)); });
}
// ---------- per-format positions ----------
// In the 9:16 preview callouts and captions move for every format; in another format's preview they get a position
// of their own for that format only (chip.pos[fmt] = { x, y }, captions.pos[fmt] = y), like the template reads them.
const ownFormat = () => S.pf !== '9:16' && S.formats?.[S.pf] ? S.pf : null;
const chipAt = c => (ownFormat() && c.pos?.[ownFormat()]) || c;
function setChipPos(v, i, x, y) {
  const c = v.chips[i], f = ownFormat();
  if (f) c.pos = { ...(c.pos || {}), [f]: { x, y } }; else { c.x = x; c.y = y; }
}
const capY = (v = V()) => v.captions?.pos?.[ownFormat()] ?? captionStyle(brandOf(), v).y;
function setCapY(v, y) {
  const f = ownFormat();
  v.captions = { ...(v.captions || {}) };
  if (f) v.captions.pos = { ...(v.captions.pos || {}), [f]: y }; else v.captions.y = y;
}
const fmtName = () => S.formats?.[S.pf]?.label || S.pf;

// ---------- taps: markers, tap mode ----------
// Taps live inside #phone-inner (they move and zoom with the device), in #phone's own pixels.
function devicePoint(doc, e) {
  const inner = doc.getElementById('phone-inner'), R = inner.getBoundingClientRect();
  return [Math.round((e.clientX - R.left) * inner.offsetWidth / R.width), Math.round((e.clientY - R.top) * inner.offsetHeight / R.height)];
}
function tapLayer(doc) {
  let layer = doc.querySelector('#phone-inner > .taps');
  if (!layer) { layer = doc.createElement('div'); layer.className = 'taps'; doc.getElementById('phone-inner')?.prepend(layer); }
  return layer;
}
// Numbered markers for every tap, shown in tap mode and while a tap is selected; the one near the playhead is bright.
function drawTapMarks(doc = $('.pv.front')?.contentDocument) {
  if (!doc?.getElementById('phone-inner') || !V()) return;
  doc.querySelectorAll('.ms-tapmark').forEach(n => n.remove());
  const show = S.tapMode || S.sel?.kind === 'tap';
  doc.body.classList.toggle('ms-tapmode', !!S.tapMode);
  if (!show) return;
  // At least ~26 screen px, however small the preview is drawn.
  doc.documentElement.style.setProperty('--mk', Math.max(1, 26 / (60 * (S.scale || 1) * (+doc.getElementById('stage')?.dataset.scale || 1))).toFixed(2));
  const layer = tapLayer(doc);
  V().taps.forEach((t, i) => {
    const m = doc.createElement('div');
    const near = Math.abs(t.t - S.t) < 0.6, sel = S.sel?.kind === 'tap' && S.sel.i === i;
    m.className = `ms-tapmark${near ? ' near' : ''}${sel ? ' sel' : ''}`;
    m.dataset.i = i;
    m.style.cssText = `left:${t.x}px;top:${t.y}px`;
    m.innerHTML = `<b>${i + 1}</b><small>${t.t.toFixed(1)}s</small>`;
    layer.append(m);
  });
}
function moveTapLive(doc, i, x, y) {
  for (const n of [doc.getElementById('tap' + i), doc.querySelector(`.ms-tapmark[data-i="${i}"]`)]) if (n) { n.style.left = `${x}px`; n.style.top = `${y}px`; }
}
function dragTapMark(doc, mark, e) {
  e.preventDefault(); e.stopPropagation();
  const i = +mark.dataset.i;
  if (!(S.sel?.kind === 'tap' && S.sel.i === i)) { S.sel = { kind: 'tap', i }; renderInspector(); renderTimeline(); drawTapMarks(doc); }
  const m = doc.querySelector(`.ms-tapmark[data-i="${i}"]`);
  m.classList.add('drag');
  let pt = null;
  const move = ev => { pt = devicePoint(doc, ev); moveTapLive(doc, i, ...pt); };
  const up = () => {
    doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up);
    m.classList.remove('drag');
    if (pt) commit(v => { v.taps[i].x = pt[0]; v.taps[i].y = pt[1]; }, { quiet: true });
  };
  doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
}
// While playing, a click lands a little after the moment it was meant for; pull it back by a typical reaction time.
function placeTap(doc, e) {
  const [x, y] = devicePoint(doc, e);
  const t = round(Math.max(0.3, S.t - (S.playing ? 0.15 : 0)));
  // Appended, not sorted: indexes must keep matching the tap elements of the preview that is on screen.
  // Not quiet: the new tap needs a rebuild to animate, which flushSave postpones until tap mode ends.
  commit(v => { v.taps.push({ t, x, y }); }, { refresh: 'timeline' });
  S.sel = { kind: 'tap', i: V().taps.length - 1 };
  renderTimeline(); drawTapMarks(doc);
  if (!S.playing) renderInspector();
}
function setTapMode(on) {
  if (on && !V()) return;
  S.tapMode = on;
  $('#btn-tapmode').classList.toggle('on', on);
  $('#stage-hint').textContent = on
    ? 'Tik-modus: klik op het apparaat om een tik op de playhead te zetten, ook tijdens afspelen. Sleep de bolletjes om ze te verplaatsen. T of Esc = klaar.'
    : 'Sleep callouts, ondertitels en tikken in de preview om ze te verplaatsen';
  drawTapMarks();
  // Leaving the mode: now build the preview once, with all new taps animated.
  if (!on && S.previewDirty && !S.saveTimer) { S.previewDirty = false; reloadPreview(); }
}

function markPreviewSelection(doc = $('.pv.front')?.contentDocument) {
  if (!doc) return;
  drawTapMarks(doc);
  doc.querySelectorAll('.ms-sel').forEach(n => n.classList.remove('ms-sel'));
  if (S.sel?.kind === 'chips') doc.getElementById(`chip${S.sel.i}`)?.classList.add('ms-sel');
  if (S.sel?.kind === 'sub') doc.getElementById('captions')?.classList.add('ms-sel');
  doc.body.classList.toggle('ms-pick', S.sel?.kind === 'zoom' || S.sel?.kind === 'tap' || !!S.tapMode);
}

// ---------- selection ----------
function selItem() {
  if (!S.sel) return null;
  if (S.sel.kind === 'end') return V();
  if (S.sel.kind === 'audio') return V().audio ? V() : null;
  if (S.sel.kind === 'music') return V().music?.src ? V().music : null;
  return listOf(S.sel.kind)?.[S.sel.i] ?? null;
}
function select(sel, jump = true) {
  S.sel = sel;
  S.multi = null;
  renderInspector(); renderTimeline(); markPreviewSelection();
  if (!jump || !sel) return;
  const it = selItem();
  const range = itemRange(sel.kind, it, sel.i);
  if (range && (S.t < range[0] || S.t >= range[1])) {
    const at = { head: range[0] + 0.9, chips: range[0] + 0.7, tap: range[0] + 0.35, zoom: range[0] + (it.dur || 0.9), end: range[0] + 1.6 }[sel.kind] ?? range[0] + 0.05;
    seek(Math.min(at, range[1] - 0.05));
  }
}
function sortedHeads() { return V().heads.map((h, i) => ({ h, i })).sort((a, b) => a.h.t - b.h.t); }
function itemRange(kind, it, i) {
  if (!it) return null;
  switch (kind) {
    case 'head': { const hs = sortedHeads(); const k = hs.findIndex(x => x.i === i); return [it.t, hs[k + 1]?.h.t ?? END()]; }
    case 'clips': case 'clips2': return [it.start, it.start + it.dur];
    case 'chips': return [it.t, it.out];
    case 'zoom': return [it.t, it.out ?? END()];
    case 'vo': return [it.t, it.t + (it.len || estLen(it.text))];
    case 'sub': return [it.t, it.out];
    case 'tap': return [it.t - 0.25, it.t + 0.5];
    case 'end': return [END(), DUR()];
    case 'audio': return [0, DUR()];
    case 'music': { const m = musicMix(V()); return [m.start, m.start + m.dur]; }
  }
}
const estLen = text => Math.max(0.8, plain(text).split(/\s+/).length * 0.36);

// ---------- adding / removing ----------
function add(kind, extra = {}) {
  const t = round(S.t);
  const room = Math.max(1, END() - t);
  let i;
  commit(v => {
    if (kind === 'head') { v.heads.push({ t, text: 'Nieuwe *tekst.*' }); i = v.heads.length - 1; }
    if (kind === 'chips') { v.chips.push({ t, out: round(Math.min(t + 2.5, END() - 0.2)), icon: 'bolt', color: 'lime', label: 'Label', text: 'Callout tekst', x: 70, y: 1420 }); i = v.chips.length - 1; }
    if (kind === 'zoom') { v.zooms.push({ t, scale: 1.3, y: 160, dur: 0.9, out: round(Math.min(t + 3, END() - 0.5)) }); i = v.zooms.length - 1; }
    if (kind === 'vo') { v.vo.lines.push({ t, text: 'Nieuwe zin voor de voice-over.' }); i = v.vo.lines.length - 1; }
    if (kind === 'tap') { const [w, h] = S.devs?.[layoutOf(v)] || [640, 1358]; v.taps.push({ t: round(Math.max(0.3, t)), x: Math.round(w / 2), y: Math.round(h * 0.45) }); i = v.taps.length - 1; }
    if (kind === 'sub') { v.subs.push({ t, out: round(Math.max(t + 0.5, Math.min(t + 2, END()))), text: 'Nieuwe ondertitel' }); i = v.subs.length - 1; }
    if (kind === 'clips' || kind === 'clips2') {
      const list = v[kind] ??= [];
      const len = isImage(extra.src) ? Math.min(3, room) : S.clipDur[extra.src] ? Math.min(S.clipDur[extra.src], room) : Math.min(4, room);
      list.push({ src: extra.src, start: t, dur: round(len), media: 0 });
      list.sort((a, b) => a.start - b.start);
      i = list.findIndex(c => c.start === t && c.src === extra.src);
    }
  });
  select({ kind, i });
  if (kind === 'tap' && !S.tapMode) setTapMode(true);
}
function removeSel() {
  if (S.multi?.length > 1) {
    const refs = [...S.multi].sort((a, b) => b.i - a.i);
    commit(v => { for (const r of refs) listOf(r.kind)?.splice(r.i, 1); });
    S.sel = null; S.multi = null; renderAll();
    return toast(`${refs.length} items verwijderd`);
  }
  const { kind, i } = S.sel || {};
  if (!kind || kind === 'end' || kind === 'brand') return;
  if (kind === 'audio') commit(v => { delete v.audio; delete v.audioVol; });
  else if (kind === 'music') commit(v => { delete v.music; });
  else commit(v => listOf(kind).splice(i, 1));
  S.sel = null; renderAll();
}
function duplicateSel() {
  const { kind, i } = S.sel || {};
  if (!kind || ['end', 'brand', 'audio', 'music'].includes(kind)) return;
  const src = clone(listOf(kind)[i]);
  const [a, b] = itemRange(kind, src, i);
  const shift = round(b - a);
  commit(v => {
    if ('start' in src) src.start = round(src.start + shift); else src.t = round(src.t + shift);
    if (src.out != null) src.out = round(src.out + shift);
    listOf(kind).push(src);
  });
  select({ kind, i: listOf(kind).length - 1 });
}

// ---------- multi-select, clipboard ----------
// Items that can be selected together and copied between videos. The clipboard lives in localStorage, so it
// works across videos, projects and restarts.
const COPYABLE = ['head', 'chips', 'zoom', 'tap', 'vo', 'sub', 'clips', 'clips2'];
const KIND_NAMES = { head: 'tekst', chips: 'callout', zoom: 'zoom', tap: 'tik', vo: 'VO-zin', sub: 'ondertitel', clips: 'clip', clips2: 'clip' };
const selectedRefs = () => S.multi?.length ? S.multi : S.sel && COPYABLE.includes(S.sel.kind) && selItem() ? [S.sel] : [];
const isSelected = it => (S.multi || (S.sel ? [S.sel] : [])).some(r => r.kind === it.kind && (it.kind === 'end' || r.i === it.i));
function toggleMulti(ref) {
  const list = S.multi || (S.sel && COPYABLE.includes(S.sel.kind) ? [S.sel] : []);
  const has = list.some(r => r.kind === ref.kind && r.i === ref.i);
  S.multi = has ? list.filter(r => !(r.kind === ref.kind && r.i === ref.i)) : [...list, ref];
  S.sel = S.multi[S.multi.length - 1] || null;
  if (S.multi.length < 2) S.multi = null;
  renderInspector(); renderTimeline(); markPreviewSelection();
}
function selectAll() {
  const refs = COPYABLE.flatMap(kind => (listOf(kind) || []).map((_, i) => ({ kind, i })));
  if (!refs.length) return;
  S.sel = refs[0]; S.multi = refs.length > 1 ? refs : null;
  renderInspector(); renderTimeline(); markPreviewSelection();
}
const startOf = (kind, d) => (kind === 'clips' || kind === 'clips2' ? d.start : d.t);
function copySel(cut) {
  const refs = selectedRefs();
  if (!refs.length) return toast('Selecteer eerst iets om te kopiëren (Ctrl+klik voor meer items, Ctrl+A voor alles).');
  const items = refs.map(r => ({ kind: r.kind, data: clone(listOf(r.kind)[r.i]) }));
  const t0 = Math.min(...items.map(x => startOf(x.kind, x.data)));
  try { localStorage.setItem('ms-clip', JSON.stringify({ v: 1, from: S.id, t0, items })); } catch {}
  if (cut) removeSel();
  toast(`${items.length} item${items.length > 1 ? 's' : ''} ${cut ? 'geknipt' : 'gekopieerd'}${cut ? '' : '. Plak met Ctrl+V op de playhead, of Ctrl+Shift+V op dezelfde tijd.'}`);
}
function pasteClip(keepTime) {
  let clip; try { clip = JSON.parse(localStorage.getItem('ms-clip') || 'null'); } catch {}
  if (!clip?.items?.length || !V()) return toast('Het klembord is leeg.');
  const shift = keepTime ? 0 : round(S.t - clip.t0);
  const dual = isDual();
  const refs = [], skipped = [];
  commit(v => {
    for (const { kind: k0, data } of clip.items) {
      const kind = k0 === 'clips2' && !dual ? 'clips' : k0;
      const d = clone(data);
      if ((kind === 'clips' || kind === 'clips2') && !S.clips.includes(d.src)) { skipped.push(d.src); continue; }
      if ('start' in d) d.start = round(d.start + shift);
      if (d.t != null) d.t = round(d.t + shift);
      if (d.out != null) d.out = round(d.out + shift);
      if (startOf(kind, d) >= DUR() || startOf(kind, d) < 0) { skipped.push(KIND_NAMES[kind]); continue; }
      const list = listOf(kind) || (v[kind] ??= []);
      list.push(d);
      refs.push({ kind, i: list.length - 1 });
    }
  });
  S.sel = refs[refs.length - 1] || null; S.multi = refs.length > 1 ? refs : null;
  renderAll();
  toast(`${refs.length} item${refs.length === 1 ? '' : 's'} geplakt${clip.from && clip.from !== S.id ? ` uit ${clip.from}` : ''}${skipped.length ? ` · ${skipped.length} overgeslagen (${[...new Set(skipped)].join(', ')})` : ''}`);
}

// ---------- markers, beats ----------
// Markers are editor-only points in time (v.markers, not rendered); beats come from the music track. Both are
// snap targets when dragging, and show in the ruler.
function toggleMarker() {
  const t = round(S.t);
  const i = (V().markers || []).findIndex(m => Math.abs(m.t - t) < 0.06);
  commit(v => { v.markers ??= []; if (i >= 0) v.markers.splice(i, 1); else v.markers.push({ t }); v.markers.sort((a, b) => a.t - b.t); }, { quiet: true, refresh: 'timeline' });
}
function jumpMarker(dir) {
  const pts = [...(V().markers || []).map(m => m.t), ...(S.snapBeats ? beatTimes() : [])].sort((a, b) => a - b);
  const t = dir > 0 ? pts.find(x => x > S.t + 0.02) : [...pts].reverse().find(x => x < S.t - 0.02);
  if (t != null) { S.player?.pause(); seek(t); }
}
function beatTimes(v = V()) {
  const src = v?.music?.src, b = src && S.beats[src];
  if (!b?.beats) return [];
  const m = musicMix(v);
  return b.beats.map(x => ({ t: round(m.start + x.t - m.media), s: x.s })).filter(x => x.t >= m.start - 0.001 && x.t <= m.start + m.dur).map(x => x.t);
}
function loadBeats() {
  const src = V()?.music?.src;
  if (!S.snapBeats || !src || S.beats[src]) return;
  S.beats[src] = 'loading';
  api(`/api/beats/${encodeURIComponent(src)}`)
    .then(b => { S.beats[src] = b; renderTimeline(); if (b.bpm) toast(`Beats gevonden in ${src}: ${b.beats.length} beats, ±${b.bpm} BPM`); })
    .catch(e => { S.beats[src] = { beats: [], error: e.message }; toast(`Beats niet gevonden: ${e.message}`, true); });
}
function renderMarks(ruler, pps) {
  for (const t of beatTimes()) ruler.append(el('div', { class: 'beat', style: `left:${t * pps}px` }));
  (V().markers || []).forEach((m, i) => {
    const node = el('div', { class: 'marker', style: `left:${m.t * pps}px`, title: `Marker ${m.t.toFixed(2)}s\nKlik: erheen · sleep: verplaatsen · dubbelklik: weghalen` });
    node.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const x0 = e.clientX; let moved = false;
      const move = ev => { moved = true; node.style.left = `${Math.max(0, m.t + (ev.clientX - x0) / S.pps) * S.pps}px`; };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        if (moved) commit(v => { v.markers[i].t = round(Math.max(0, Math.min(DUR(), m.t + (ev.clientX - x0) / S.pps))); v.markers.sort((a, b) => a.t - b.t); }, { quiet: true, refresh: 'timeline' });
        else { S.player?.pause(); seek(m.t); }
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    node.addEventListener('dblclick', () => commit(v => v.markers.splice(i, 1), { quiet: true, refresh: 'timeline' }));
    ruler.append(node);
  });
}

// ---------- rendering ----------
function renderAll() { ensureLists(); renderTimeline(); renderInspector(); renderLibrary(); renderFormatBar(); onTime(); }

function renderLibrary() {
  const used = new Set([...(V()?.clips || []), ...(V()?.clips2 || [])].map(c => c.src));
  const screen = screenOf();
  $('#clip-list').replaceChildren(...S.clips.map(name => {
    const img = isImage(name);
    const vid = img ? el('img', { src: `/assets/clips/${name}`, alt: '' }) : el('video', { src: `/assets/clips/${name}#t=1.2`, muted: true, preload: 'metadata', playsInline: true });
    const dur = el('i', {}, img ? 'foto' : S.clipDur[name] ? `${S.clipDur[name].toFixed(1)}s` : '');
    const dual = V() && isDual();
    // The card has the screen's shape, so it shows what the device will show when the clip fills it.
    const size = clipSize(name, renderLibrary);
    const f = size && fitInfo({}, size, screen);
    const bad = f && (f.cutX > 0.08 || f.cutY > 0.08 || f.k > 1.2);
    const card = el('button', { class: `clip-card${used.has(name) ? ' used' : ''}`, style: `aspect-ratio:${screen[0]} / ${screen[1]}`, title: `${name}${size ? ` (${size[0]} × ${size[1]})` : ''}\nKlik: op de playhead in het apparaat zetten${dual ? '\nShift+klik: telefoon 2' : ''}` },
      vid, dur, el('span', {}, name.replace(/\.\w+$/, '')),
      bad ? el('b', { class: 'fitw', title: 'Past niet goed in deze layout: er valt veel weg of het wordt flink vergroot. Klik de clip aan voor details.' }, icon('crop')) : null);
    if (!img) {
      vid.addEventListener('loadedmetadata', () => { S.clipDur[name] = vid.duration; dur.textContent = `${vid.duration.toFixed(1)}s`; });
      card.addEventListener('mouseenter', () => { vid.currentTime = 0; vid.play().catch(() => {}); });
      card.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 1.2; });
    }
    card.addEventListener('click', e => add(e.shiftKey && dual ? 'clips2' : 'clips', { src: name }));
    return el('div', { class: 'clip-wrap' }, card,
      el('button', { class: 'clip-del ghost icon', title: 'Bestand verwijderen', onclick: () => deleteAsset('clips', name) }, icon('delete')));
  }));
  $('#audio-list').replaceChildren(...(S.audio.length ? S.audio.map(audioItem) : [el('p', { class: 'hint' }, 'Nog geen audio. Upload muziek of een opname (wav, mp3, m4a).')]));
}

// Timeline rows are derived from the spec each render.
function rows() {
  const v = V(), end = END(), dur = DUR();
  const hs = sortedHeads();
  const R = [];
  R.push({ key: 'head', label: 'Tekst', icon: 'title', items: hs.map((x, k) => ({ kind: 'head', i: x.i, s: x.h.t, e: hs[k + 1]?.h.t ?? end, text: plain(x.h.text), cls: x.h.hook ? 'hook' : '', noResize: true })) });
  const clipRow = (kind, label) => ({ key: kind, label, icon: 'smartphone', items: (v[kind] || []).map((c, i) => ({ kind, i, s: c.start, e: c.start + c.dur, text: `${c.src.replace(/\.\w+$/, '')}${c.rate && c.rate !== 1 ? ` ×${c.rate}` : ''}`, ic: 'movie' })) });
  const devName = { phone: 'Telefoon', dual: 'Telefoon 1', tablet: 'Tablet', browser: 'Browser', full: 'Beeld' }[layoutOf(v)];
  R.push(clipRow('clips', devName));
  if (isDual(v)) R.push(clipRow('clips2', 'Telefoon 2'));
  // Callouts can overlap: give each its own lane.
  const lanes = [];
  const chipItems = v.chips.map((c, i) => ({ c, i })).sort((a, b) => a.c.t - b.c.t).map(({ c, i }) => {
    let lane = lanes.findIndex(e => e <= c.t + 0.001);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = c.out;
    return { kind: 'chips', i, s: c.t, e: c.out, text: `${c.label} · ${c.text}`, ic: c.icon, cls: `c-${c.color}`, lane };
  });
  R.push({ key: 'chips', label: 'Callouts', icon: 'sell', lanes: Math.max(1, lanes.length), items: chipItems });
  R.push({ key: 'zoom', label: 'Zoom', icon: 'zoom_in', items: v.zooms.map((z, i) => ({ kind: 'zoom', i, s: z.t, e: z.out ?? end, text: `×${z.scale}`, ramp: z.dur })) });
  R.push({ key: 'vo', label: 'Voice-over', icon: 'record_voice_over', items: v.vo.lines.map((l, i) => ({ kind: 'vo', i, s: l.t, e: l.t + (l.len || estLen(l.text)), text: l.text, len: l.len, noResize: true })) });
  R.push({ key: 'tap', label: 'Tikken', icon: 'touch_app', items: v.taps.map((x, i) => ({ kind: 'tap', i, s: x.t - 0.25, e: x.t + 0.5, text: '', ic: x.style === 'cursor' || (!x.style && layoutOf(v) === 'browser') ? 'arrow_selector_tool' : 'touch_app', noResize: true })) });
  R.push({ key: 'sub', label: 'Ondertitels', icon: 'subtitles', items: v.subs.map((x, i) => ({ kind: 'sub', i, s: x.t, e: x.out, text: plain(x.text), cls: v.captions?.off ? 'off' : '' })) });
  if (v.audio) R.push({ key: 'audio', label: 'Stem', icon: 'graphic_eq', items: [{ kind: 'audio', i: 0, s: 0, e: dur, text: v.audio + (v.audioVol != null && v.audioVol !== 1 ? ` · ${Math.round(v.audioVol * 100)}%` : ''), noResize: true, noMove: true }] });
  if (v.music?.src) { const m = musicMix(v); R.push({ key: 'music', label: 'Muziek', icon: 'queue_music', items: [{ kind: 'music', i: 0, s: m.start, e: m.start + m.dur, text: v.music.src, ic: 'music_note', env: m }] }); }
  R.push({ key: 'end', label: 'Eindkaart', icon: 'flag', items: [{ kind: 'end', i: 0, s: end, e: dur, text: plain(v.tagline) || tr('Eindkaart') }] });
  return R;
}

function renderTimeline() {
  if (!V()) return;
  const pps = S.pps, dur = DUR();
  const width = dur * pps + 60;
  $('#tl-inner').style.width = `${width + 128}px`;
  // ruler
  const ruler = $('#tl-ruler');
  ruler.replaceChildren();
  const step = pps < 35 ? 2 : 1;
  for (let s = 0; s <= dur + 0.001; s += step) ruler.append(el('div', { class: 'tick', style: `left:${s * pps}px` }, `${s}s`));
  if (pps >= 50) for (let s = 0.5; s < dur; s += 1) ruler.append(el('div', { class: 'tick minor', style: `left:${s * pps}px` }));
  ruler.append(el('div', { class: 'out', style: `left:${dur * pps}px;width:60px` }));
  loadBeats();
  renderMarks(ruler, pps);

  const rowsEl = $('#tl-rows');
  rowsEl.replaceChildren(...rows().map(r => {
    const h = 34 * (r.lanes || 1);
    const track = el('div', { class: 'tl-track', style: `height:${h}px` });
    track.append(el('div', { class: 'past', style: `left:${dur * pps}px;width:60px` }));
    for (const it of r.items) {
      const sel = isSelected(it);
      const node = el('div', {
        class: `tl-item k-${it.kind} ${it.cls || ''}${sel ? ' sel' : ''}`,
        style: `left:${it.s * pps}px;width:${Math.max(6, (it.e - it.s) * pps)}px;top:${3 + (it.lane || 0) * 34}px`,
        title: `${it.text}\n${it.s.toFixed(2)}s → ${it.e.toFixed(2)}s`
      });
      if (it.kind === 'clips' || it.kind === 'clips2') node.append(el('div', { class: 'thumb' }));
      if (it.ramp) node.append(el('div', { class: 'ramp', style: `width:${it.ramp * pps}px` }));
      if (it.kind === 'vo' && it.len) node.append(el('div', { class: 'len', style: `width:100%` }));
      if (it.env) node.append(envelopeSvg(it.env, 'env'));
      if (it.ic) node.append(icon(it.ic));
      node.append(el('span', { class: 'lbl' }, it.text));
      if (!it.fixed) {
        if (!it.noResize) node.append(el('div', { class: 'h l', 'data-edge': 'l' }), el('div', { class: 'h r', 'data-edge': 'r' }));
        node.addEventListener('pointerdown', e => startDrag(e, it));
      }
      track.append(node);
    }
    track.addEventListener('pointerdown', e => { if (e.target === track) { seek(xToTime(e)); scrub(e); } });
    return el('div', { class: 'tl-row' }, el('div', { class: 'tl-label', style: `height:${h}px` }, icon(r.icon), r.label), track);
  }));
  onTime();
}
const xToTime = e => (e.clientX - $('#tl-rows .tl-track').getBoundingClientRect().left) / S.pps;
function scrub(e) {
  const move = ev => seek(xToTime(ev));
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// Drag to move, drag an edge to trim. Snaps to the playhead and to other items' edges.
function startDrag(e, it) {
  e.preventDefault(); e.stopPropagation();
  if ((e.ctrlKey || e.metaKey || e.shiftKey) && COPYABLE.includes(it.kind)) return toggleMulti({ kind: it.kind, i: it.i });
  if (it.noMove) return select({ kind: it.kind, i: it.i ?? 0 });
  S.player?.pause();
  const edge = e.target.dataset.edge || 'move';
  const x0 = e.clientX;
  const before = clone(V());
  const orig = clone(it.kind === 'end' ? { end: END(), dur: DUR() } : it.kind === 'music' ? { ...musicDefaults, ...V().music, dur: it.e - it.s } : listOf(it.kind)[it.i]);
  const snaps = [0, S.t, END(), DUR(), ...(V().markers || []).map(m => m.t), ...(S.snapBeats ? beatTimes() : [])];
  for (const r of rows()) for (const o of r.items) if (!(o.kind === it.kind && o.i === it.i)) snaps.push(o.s, o.e);
  const snap = x => { let best = x, d = 7 / S.pps; for (const s of snaps) if (Math.abs(s - x) < d) { d = Math.abs(s - x); best = s; } return round(best); };
  let moved = false;
  if (!(S.sel && S.sel.kind === it.kind && S.sel.i === it.i)) { S.sel = { kind: it.kind, i: it.i }; renderInspector(); }

  const move = ev => {
    const dt = (ev.clientX - x0) / S.pps;
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    const v = V(), o = orig;
    const len = it.e - it.s;
    const snapMove = s => { const a = snap(s), b = snap(s + len); return Math.abs(a - s) <= Math.abs(b - s - len) ? a : round(b - len); };
    switch (it.kind) {
      case 'head': v.heads[it.i].t = Math.max(0, snapMove(o.t + dt)); break;
      case 'tap': v.taps[it.i].t = Math.max(0.25, snap(o.t + dt)); break;
      case 'vo': v.vo.lines[it.i].t = Math.max(0, snapMove(o.t + dt)); break;
      case 'clips': case 'clips2': {
        const c = v[it.kind][it.i], rate = o.rate || 1;
        if (edge === 'move') c.start = Math.max(0, snapMove(o.start + dt));
        const still = isImage(c.src), media = o.media || 0;
        if (edge === 'l') { const s = Math.min(snap(o.start + dt), o.start + o.dur - 0.1); const d = still ? s : Math.max(s, o.start - media / rate); c.start = round(Math.max(0, d)); c.dur = round(o.dur - (c.start - o.start)); if (!still) c.media = round(Math.max(0, media + (c.start - o.start) * rate)); }
        if (edge === 'r') { const d = snap(o.start + o.dur + dt) - o.start; const max = !still && S.clipDur[c.src] ? (S.clipDur[c.src] - media) / rate : Infinity; c.dur = round(Math.max(0.1, Math.min(d, max))); }
        break;
      }
      case 'chips': case 'sub': {
        const c = listOf(it.kind)[it.i];
        if (edge === 'move') { c.t = Math.max(0, snapMove(o.t + dt)); c.out = round(c.t + (o.out - o.t)); }
        if (edge === 'l') c.t = Math.min(snap(o.t + dt), o.out - 0.3);
        if (edge === 'r') c.out = Math.max(snap(o.out + dt), o.t + 0.3);
        break;
      }
      case 'zoom': {
        const z = v.zooms[it.i], out = o.out ?? END();
        if (edge === 'move') { z.t = Math.max(0, snapMove(o.t + dt)); if (o.out != null) z.out = round(z.t + (o.out - o.t)); }
        if (edge === 'l') z.t = Math.min(snap(o.t + dt), out - z.dur);
        if (edge === 'r') { const x = snap(out + dt); z.out = x >= END() - 0.05 ? undefined : Math.max(x, z.t + z.dur); }
        break;
      }
      case 'music': {
        const m = v.music;
        if (edge === 'move') m.start = Math.max(0, snapMove(o.start + dt));
        if (edge === 'l') { const s = Math.min(snap(o.start + dt), o.start + o.dur - 0.5); const d = Math.max(s - o.start, -o.media, -o.start); m.start = round(o.start + d); m.media = round(o.media + d); m.dur = round(o.dur - d); }
        if (edge === 'r') {
          const len = S.audioDur[m.src] ? S.audioDur[m.src] - o.media : Infinity;
          const d = Math.min(Math.max(0.5, snap(o.start + o.dur + dt) - o.start), len);
          if (o.start + d >= DUR() - 0.05) delete m.dur; else m.dur = round(d);
        }
        break;
      }
      case 'end': {
        if (edge === 'l' || edge === 'move') v.end = Math.max(1, Math.min(snap(o.end + dt), o.dur - 0.5));
        if (edge === 'move') v.dur = round(v.end + (o.dur - o.end));
        if (edge === 'r') v.dur = Math.max(snap(o.dur + dt), o.end + 0.5);
        break;
      }
    }
    renderTimeline();
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    if (moved) {
      S.history.push(before); S.future = []; S.lastKey = null;
      if (it.kind === 'clips' || it.kind === 'clips2') V()[it.kind].sort((a, b) => a.start - b.start);
      renderAll(); scheduleSave();
    } else select({ kind: it.kind, i: it.i });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// ---------- inspector ----------
function field(label, value, onInput, opts = {}) {
  const { type = 'text', step, min, max, key, placeholder, textarea } = opts;
  const input = textarea ? el('textarea', { rows: 3 }) : el('input', { type, ...(step != null && { step }), ...(min != null && { min }), ...(max != null && { max }), ...(placeholder && { placeholder }) });
  input.value = value ?? '';
  input.addEventListener('input', () => {
    let val = input.value;
    if (type === 'number') { if (val === '') { if (!opts.optional) return; val = undefined; } else { val = +val; if (Number.isNaN(val)) return; } }
    commit(v => onInput(val, v), { key: key || label + JSON.stringify(S.sel), refresh: 'timeline' });
    opts.after?.();
  });
  return el('label', { class: 'field' }, el('span', {}, label), input);
}
function check(label, value, onChange, refresh = 'all') {
  const input = el('input', { type: 'checkbox', checked: !!value });
  input.addEventListener('change', () => commit(v => onChange(input.checked, v), { refresh }));
  return el('label', { class: 'check' }, input, label);
}
function selectField(label, value, options, onChange) {
  const s = el('select', {}, ...options.map(([val, text]) => el('option', { value: val }, text)));
  s.value = value ?? '';
  s.addEventListener('change', () => commit(v => onChange(s.value, v)));
  return el('label', { class: 'field' }, el('span', {}, label), s);
}
const head = (ic, title, ...extra) => el('div', { class: 'insp-head' }, el('span', { class: 'badge' }, icon(ic)), el('h2', {}, title), ...extra);
const actions = () => el('div', { class: 'insp-actions' },
  el('button', { onclick: duplicateSel, title: 'Ctrl+D' }, icon('content_copy'), 'Dupliceren'),
  el('button', { class: 'danger', onclick: removeSel, title: 'Delete' }, icon('delete'), 'Verwijderen'));

function renderInspector() {
  const box = $('#inspector');
  const k = S.sel?.kind;
  // The brand editor also works in a project that has no videos yet.
  if (k === 'brand' && S.workspace) return box.replaceChildren(...brandPanel().filter(Boolean));
  if (!V()) return box.replaceChildren(...(S.workspace ? emptyPanel() : []));
  const it = selItem();
  const i = S.sel?.i;
  let content;
  if (S.multi?.length > 1) {
    const count = {};
    for (const r of S.multi) count[KIND_NAMES[r.kind]] = (count[KIND_NAMES[r.kind]] || 0) + 1;
    content = [
      head('select_all', `${S.multi.length} items geselecteerd`),
      el('p', { class: 'hint' }, Object.entries(count).map(([k, n]) => `${n}× ${k}`).join(', ')),
      el('p', { class: 'hint' }, 'Ctrl+klik op de tijdlijn om items toe te voegen of weg te halen. Kopieer ze naar een andere video met Ctrl+C en plak daar met Ctrl+V (op de playhead) of Ctrl+Shift+V (op dezelfde tijd).'),
      el('div', { class: 'insp-actions' },
        el('button', { onclick: () => copySel(false) }, icon('content_copy'), 'Kopiëren'),
        el('button', { class: 'danger', onclick: removeSel }, icon('delete'), 'Verwijderen'),
        el('button', { class: 'ghost', onclick: () => select(null) }, 'Deselecteren'))
    ];
    return box.replaceChildren(...content);
  }
  if (!it) content = videoPanel();
  else if (k === 'head') content = [
    head('title', 'Tekst', el('span', { class: 'muted' }, it.hook ? 'hook' : '')),
    field('Tekst', it.text, (x, v) => (v.heads[i].text = x), { textarea: true }),
    el('p', { class: 'hint' }, 'Zet *sterretjes* om woorden heen voor de accentkleur. Blijft staan tot de volgende tekst.'),
    field('Start (s)', it.t, (x, v) => (v.heads[i].t = x), { type: 'number', step: 0.05, min: 0 }),
    check('Hook (grotere tekst, voor de opening)', it.hook, (x, v) => { if (x) v.heads[i].hook = true; else delete v.heads[i].hook; }),
    actions()
  ];
  else if (k === 'clips' || k === 'clips2') content = clipPanel(k, i, it);
  else if (k === 'chips') content = chipPanel(i, it);
  else if (k === 'zoom') content = [
    head('zoom_in', 'Zoom'),
    el('p', { class: 'hint' }, 'Zoomt in op de telefoon en dimt de bovenkant zodat de tekst leesbaar blijft.'),
    el('div', { class: 'field-row' },
      field('Start (s)', it.t, (x, v) => (v.zooms[i].t = x), { type: 'number', step: 0.05, min: 0 }),
      field('Animatieduur (s)', it.dur, (x, v) => (v.zooms[i].dur = x), { type: 'number', step: 0.05, min: 0.1 })),
    el('div', { class: 'field-row' },
      field('Schaal', it.scale, (x, v) => (v.zooms[i].scale = x), { type: 'number', step: 0.05, min: 1 }),
      it.fx == null ? field('Verschuiving Y (px)', it.y, (x, v) => (v.zooms[i].y = x), { type: 'number', step: 10 }) : null),
    field('Terug uitzoomen op (s)', it.out, (x, v) => { if (x == null) delete v.zooms[i].out; else v.zooms[i].out = x; }, { type: 'number', step: 0.05, optional: true, placeholder: 'tot de eindkaart' }),
    el('div', { class: 'insp-section' },
      el('h3', {}, 'Focuspunt'),
      it.fx != null
        ? [el('div', { class: 'field-row' },
            field('X (px)', it.fx, (x, v) => (v.zooms[i].fx = x), { type: 'number', step: 10 }),
            field('Y (px)', it.fy, (x, v) => (v.zooms[i].fy = x), { type: 'number', step: 10 })),
          el('p', { class: 'hint' }, 'Dit punt van het scherm schuift naar het midden. Klik op het apparaat in de preview om een ander punt te kiezen.'),
          el('button', { class: 'ghost', onclick: () => commit(v => { delete v.zooms[i].fx; delete v.zooms[i].fy; }) }, icon('filter_center_focus'), 'Focuspunt wissen')]
        : el('p', { class: 'hint' }, 'Klik op het apparaat in de preview om in te zoomen op dat punt, bijvoorbeeld een knop. Zonder focuspunt gebruikt de zoom de Y-verschuiving: negatief = naar de onderkant, positief = naar de bovenkant.')),
    actions()
  ];
  else if (k === 'vo') content = [
    head('record_voice_over', 'Voice-over zin'),
    field('Tekst', it.text, (x, v) => { v.vo.lines[i].text = x; delete v.vo.lines[i].len; }, { textarea: true }),
    field('Start (s)', it.t, (x, v) => (v.vo.lines[i].t = x), { type: 'number', step: 0.05, min: 0 }),
    el('p', { class: 'hint' }, it.len ? `Ingesproken lengte: ${it.len.toFixed(2)}s.` : 'Nog niet ingesproken. Klik op "Voice-over maken" om hem te genereren.'),
    el('button', { class: 'primary', onclick: generateVo }, icon('graphic_eq'), 'Voice-over maken'),
    actions()
  ];
  else if (k === 'tap') content = [
    head('touch_app', 'Tik'),
    el('p', { class: 'hint' }, 'Sleep het oranje bolletje in de preview, of klik op het apparaat om de tik daarheen te zetten. Met Tik-modus (T) zet elke klik een nieuwe tik op de playhead, ook tijdens het afspelen.'),
    el('button', { class: S.tapMode ? 'primary' : '', onclick: () => { setTapMode(!S.tapMode); renderInspector(); } }, icon('touch_app'), S.tapMode ? 'Tik-modus stoppen' : 'Tik-modus'),
    field('Moment (s)', it.t, (x, v) => (v.taps[i].t = Math.max(0.25, x)), { type: 'number', step: 0.05, min: 0.25 }),
    el('div', { class: 'field-row' },
      field('X (px)', it.x, (x, v) => (v.taps[i].x = x), { type: 'number', step: 5 }),
      field('Y (px)', it.y, (x, v) => (v.taps[i].y = x), { type: 'number', step: 5 })),
    selectField('Weergave', it.style || '', [['', layoutOf() === 'browser' ? 'Automatisch (muisaanwijzer)' : 'Automatisch (vinger)'], ['finger', 'Vinger'], ['cursor', 'Muisaanwijzer']], (x, v) => { if (x) v.taps[i].style = x; else delete v.taps[i].style; }),
    el('p', { class: 'hint' }, 'Tip: zet de tik net vóór het moment dat er in de opname iets verandert. Een tik zoomt mee met een zoom.'),
    actions()
  ];
  else if (k === 'audio') content = [
    head('graphic_eq', 'Stem / audiospoor'),
    selectField('Bestand', V().audio, S.audio.map(a => [a, a]), (x, v) => { v.audio = x; }),
    slider('Volume', V().audioVol ?? 1, (x, v) => { if (x === 1) delete v.audioVol; else v.audioVol = x; }),
    el('p', { class: 'hint' }, '"Voice-over maken" vervangt dit spoor door de nieuwe voice-over. Muziek zet je op een eigen spoor: klik links bij Audio op het muziek-icoon.'),
    el('div', { class: 'insp-actions' }, el('button', { class: 'danger', onclick: removeSel, title: 'Delete' }, icon('delete'), 'Uit video halen'))
  ];
  else if (k === 'music') content = musicPanel(it);
  else if (k === 'sub') content = [
    head('subtitles', 'Ondertitel', V().captions?.off ? el('span', { class: 'muted' }, 'verborgen') : null),
    field('Tekst', it.text, (x, v) => (v.subs[i].text = x), { textarea: true }),
    el('p', { class: 'hint' }, `*Sterretjes* = accentkleur. De woorden worden over de duur van het blok verdeeld en verschijnen ${captionStyle(brandOf(), V()).words} per keer.`),
    el('div', { class: 'field-row' },
      field('In (s)', it.t, (x, v) => (v.subs[i].t = x), { type: 'number', step: 0.05, min: 0 }),
      field('Uit (s)', it.out, (x, v) => (v.subs[i].out = x), { type: 'number', step: 0.05, min: 0 })),
    el('div', { class: 'insp-actions' },
      el('button', { onclick: splitAtPlayhead, title: 'S' }, icon('content_cut'), 'Splits op playhead'),
      el('button', { onclick: duplicateSel, title: 'Ctrl+D' }, icon('content_copy'), 'Dupliceren'),
      el('button', { class: 'danger', onclick: removeSel, title: 'Delete' }, icon('delete'), 'Verwijderen')),
    el('div', { class: 'insp-section' }, el('h3', {}, 'Stijl (hele video)'), ...captionStyleFields())
  ];
  else if (k === 'end') content = [
    head('flag', 'Eindkaart'),
    field('Slogan', it.tagline, (x, v) => (v.tagline = x)),
    el('p', { class: 'hint' }, '*Sterretjes* = accentkleur.'),
    el('div', { class: 'field-row' },
      field('Begint op (s)', END(), (x, v) => (v.end = x), { type: 'number', step: 0.05, min: 1 }),
      field('Video eindigt op (s)', DUR(), (x, v) => (v.dur = x), { type: 'number', step: 0.05, min: 1 }))
  ];
  box.replaceChildren(...[content].flat().filter(Boolean));
}

const LAYOUT_ICONS = { phone: 'smartphone', dual: 'devices', tablet: 'tablet_mac', browser: 'web', full: 'fullscreen' };
function videoPanel() {
  const v = V();
  const brand = brandOf();
  const voices = [...KOKORO, ...S.tts.piper.map(p => [p, PIPER_LABELS[p] || p])];
  const defVoice = v.vo?.voice || (brand.lang === 'nl' && S.tts.piper.length ? S.tts.piper[0] : 'am_michael');
  const layout = layoutOf();
  return [
    head('movie', v.id),
    field('Bovenregel', v.overline, (x, v) => (v.overline = x)),
    el('label', { class: 'field' }, el('span', {}, 'Merk'),
      el('div', { class: 'path-row' },
        (() => { const s = el('select', {}, ...S.brands.map(b => el('option', { value: b.id }, b.name + (b.id === S.workspace.defaultBrand ? ' (standaard)' : '')))); s.value = brand.id; s.onchange = () => commit(v => { v.brand = s.value; }); return s; })(),
        el('button', { class: 'ghost', title: 'Merk bewerken', onclick: () => select({ kind: 'brand', i: 0 }, false) }, icon('palette'), 'Bewerk'))),
    el('label', { class: 'field' }, el('span', {}, 'Layout'),
      el('div', { class: 'layout-grid' }, ...Object.entries(S.layouts).map(([k, label]) =>
        el('button', { class: k === layout ? 'on' : '', title: label, onclick: () => commit(v => { v.layout = k; delete v.dual; if (k === 'dual' && !v.clips2?.length) v.clips2 = clone(v.clips); }) }, icon(LAYOUT_ICONS[k] || 'crop_portrait'), label.split(' (')[0])))),
    el('label', { class: 'field' }, el('span', {}, 'Renderen in'),
      el('div', { class: 'fmt-checks' }, ...Object.entries(S.formats || {}).map(([k, f]) => {
        const list = v.formats?.length ? v.formats : ['9:16'];
        const box = el('input', { type: 'checkbox', checked: list.includes(k) });
        box.onchange = () => commit(v => {
          const next = new Set(v.formats?.length ? v.formats : ['9:16']);
          if (box.checked) next.add(k); else next.delete(k);
          v.formats = Object.keys(S.formats).filter(x => next.has(x));
          if (!v.formats.length || (v.formats.length === 1 && v.formats[0] === '9:16')) delete v.formats;
        });
        return el('label', { class: 'check', title: `${f.w} × ${f.h}` }, box, f.label);
      }))),
    el('p', { class: 'hint' }, 'Render MP4 maakt elk aangevinkt formaat. Bekijk ze met de knoppen boven de preview; tekst en apparaat worden per formaat opnieuw geschikt.'),
    el('div', { class: 'field-row' },
      field('Lengte (s)', DUR(), (x, v) => (v.dur = x), { type: 'number', step: 0.1, min: 2 }),
      field('Eindkaart vanaf (s)', END(), (x, v) => (v.end = x), { type: 'number', step: 0.1, min: 1 })),
    field('Eindkaart slogan', v.tagline, (x, v) => (v.tagline = x)),
    layout === 'dual' ? el('div', { class: 'field-row' },
      field('Naam links', v.names?.[0] ?? 'Alex', (x, v) => { v.names = [x, v.names?.[1] ?? 'Jordan']; }),
      field('Naam rechts', v.names?.[1] ?? 'Jordan', (x, v) => { v.names = [v.names?.[0] ?? 'Alex', x]; })) : null,
    el('div', { class: 'insp-section' },
      el('h3', {}, 'Audio & voice-over'),
      el('div', { class: 'field-row' },
        selectField('Stem / audiospoor', v.audio || '', [['', 'Geen'], ...S.audio.map(a => [a, a])], (x, v) => { if (x) v.audio = x; else { delete v.audio; delete v.audioVol; } }),
        selectField('Muziek', v.music?.src || '', [['', 'Geen'], ...S.audio.map(a => [a, a])], (x, v) => { if (x) v.music = { ...(v.music || {}), src: x, media: 0 }; else delete v.music; })),
      selectField('Stem', defVoice, voices, (x, v) => { v.vo.voice = x; }),
      field('Snelheid', v.vo?.speed ?? (defVoice.startsWith('nl_') ? 1 : 1.08), (x, v) => { v.vo.speed = x; }, { type: 'number', step: 0.02, min: 0.5, max: 2 }),
      el('p', { class: 'hint' }, `${v.vo.lines.length} zin(nen) op de Voice-over track. Voeg zinnen toe met "VO-zin", zet ze op de juiste tijd en klik op maken. Het resultaat wordt het audiospoor.`),
      el('button', { class: 'primary', onclick: generateVo, disabled: !v.vo.lines.length }, icon('graphic_eq'), 'Voice-over maken')),
    captionsSection(),
    el('div', { class: 'insp-section' },
      el('h3', {}, 'Sneltoetsen'),
      el('p', { class: 'hint' }, 'Spatie afspelen · ←/→ frame · Shift+←/→ 1 s · Home begin · S splitsen · Del verwijderen · Ctrl+D dupliceren · Ctrl+Z / Ctrl+Shift+Z · Esc deselecteren')),
    el('div', { class: 'insp-actions' }, el('button', { class: 'danger', onclick: () => deleteVideo() }, icon('delete'), 'Video verwijderen'))
  ];
}

// ---------- audio ----------
function slider(label, value, onInput, { min = 0, max = 1, step = 0.01, fmt = x => `${Math.round(x * 100)}%` } = {}) {
  const out = el('b', {}, fmt(value));
  const input = el('input', { type: 'range', min, max, step });
  input.value = value;
  input.addEventListener('input', () => { out.textContent = fmt(+input.value); commit(v => onInput(+input.value, v), { key: label + JSON.stringify(S.sel), refresh: 'timeline' }); });
  return el('label', { class: 'field slider' }, el('span', {}, label, out), input);
}
// Volume curve of the music bed (0..dur × 0..1), drawn in the timeline block and the inspector.
function envelopeSvg(m, cls) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', cls); svg.setAttribute('viewBox', `0 0 ${m.dur} 1`); svg.setAttribute('preserveAspectRatio', 'none');
  const pts = m.points.map(p => `${p.t},${(1 - p.v).toFixed(4)}`);
  const area = document.createElementNS(NS, 'polygon');
  area.setAttribute('points', `0,1 ${pts.join(' ')} ${m.dur},1`);
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', pts.join(' ')); line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(area, line);
  return svg;
}
function audioLen(name) {
  if (!name || S.audioDur[name]) return;
  const a = new Audio(`/assets/vo/${encodeURIComponent(name)}`);
  a.preload = 'metadata';
  a.onloadedmetadata = () => { S.audioDur[name] = a.duration; if (S.sel?.kind === 'music') renderInspector(); };
}
function audioItem(a) {
  const v = V();
  const role = v?.audio === a ? 'stem' : v?.music?.src === a ? 'muziek' : '';
  const play = el('button', { class: 'ghost icon', title: 'Beluisteren' }, icon(S.listening?.name === a ? 'stop' : 'play_arrow'));
  play.onclick = () => {
    const cur = S.listening;
    cur?.audio.pause(); S.listening = null;
    if (cur?.name !== a) {
      const audio = new Audio(`/assets/vo/${encodeURIComponent(a)}`);
      audio.onended = () => { S.listening = null; renderLibrary(); };
      audio.play().catch(() => {});
      S.listening = { name: a, audio };
    }
    renderLibrary();
  };
  return el('div', { class: `audio-item${role ? ' used' : ''}` }, play,
    el('span', { class: 'name', title: a }, a), role ? el('i', {}, role) : null,
    v ? el('button', { class: 'ghost icon', title: 'Als muziek onder de video', onclick: () => { commit(v => { v.music = { ...(v.music || {}), src: a, media: 0 }; delete v.music.dur; }); select({ kind: 'music', i: 0 }); } }, icon('queue_music')) : null,
    v ? el('button', { class: 'ghost icon', title: 'Als stem / audiospoor', onclick: () => { commit(v => { v.audio = a; }); select({ kind: 'audio', i: 0 }); } }, icon('record_voice_over')) : null,
    el('button', { class: 'ghost icon danger', title: 'Bestand verwijderen', onclick: () => deleteAsset('vo', a) }, icon('delete')));
}
function musicPanel(it) {
  const v = V(), m = { ...musicDefaults, ...it }, mix = musicMix(v);
  audioLen(m.src);
  const len = S.audioDur[m.src];
  const spans = v.audio ? speechSpans(v) : [];
  const set = fn => (x, v) => fn(x, v.music);
  return [
    head('queue_music', 'Muziek'),
    selectField('Bestand', m.src, S.audio.map(a => [a, a]), (x, v) => { v.music.src = x; v.music.media = 0; delete v.music.dur; }),
    el('div', { class: 'env-box' }, envelopeSvg(mix, 'env big')),
    el('p', { class: 'hint' }, `${mix.start.toFixed(1)}s → ${(mix.start + mix.dur).toFixed(1)}s in de video${len ? ` · nummer ${len.toFixed(1)}s` : ''}. De lijn is het volume.`),
    slider('Volume', m.vol, set((x, mm) => (mm.vol = x))),
    slider('Zachter onder de stem', 1 - m.duck, set((x, mm) => (mm.duck = round(1 - x))), { max: 0.95 }),
    slider('Ruimte voor de stem (EQ)', m.carve ?? 0, set((x, mm) => (mm.carve = round(x))), { fmt: x => (x > 0 ? `−${Math.round(12 * x)} dB rond 1,6 kHz` : 'uit') }),
    el('p', { class: 'hint' }, 'Haalt tijdens het spreken alleen de spraakfrequenties uit de muziek. Zo blijft de stem verstaanbaar en kan de muziek voller blijven. Je hoort het ook in de preview.'),
    el('p', { class: 'hint' }, !v.audio ? 'Er is geen stemspoor, dus de muziek hoeft nergens zachter.'
      : v.vo.lines.some(l => l.len) ? `Zakt weg onder ${spans.length} stuk(ken) voice-over en komt in de pauzes weer omhoog.`
      : 'Het stemspoor heeft geen voice-over zinnen met een lengte, dus de muziek blijft de hele tijd zachter.'),
    el('div', { class: 'field-row' },
      field('Fade-in (s)', m.fadeIn, set((x, mm) => (mm.fadeIn = Math.max(0, x))), { type: 'number', step: 0.1, min: 0 }),
      field('Fade-out (s)', m.fadeOut, set((x, mm) => (mm.fadeOut = Math.max(0, x))), { type: 'number', step: 0.1, min: 0 })),
    el('div', { class: 'field-row' },
      field('Start in video (s)', m.start, set((x, mm) => (mm.start = Math.max(0, x))), { type: 'number', step: 0.1, min: 0 }),
      field('Begin in nummer (s)', m.media, set((x, mm) => (mm.media = Math.max(0, x))), { type: 'number', step: 0.1, min: 0 })),
    len && m.media + mix.dur > len + 0.05 ? el('p', { class: 'warn' }, `Het nummer is ${(m.media + mix.dur - len).toFixed(1)}s te kort; daarna is het stil. Kort het muziekblok in of kies een eerder beginpunt.`) : null,
    el('p', { class: 'hint' }, 'Sleep het blok op de tijdlijn om het te verschuiven, sleep de randen om in te korten. Del haalt het uit de video.'),
    el('div', { class: 'insp-actions' }, el('button', { class: 'danger', onclick: removeSel, title: 'Delete' }, icon('delete'), 'Uit video halen'))
  ];
}

// ---------- captions ----------
// Style = defaults < brand.captions < video.captions, so a brand can set the house style and a video can deviate.
function captionsSection() {
  const v = V();
  const lines = v.vo.lines.filter(l => l.text?.trim());
  const importInput = el('input', { type: 'file', accept: '.srt,.vtt', hidden: true });
  importInput.onchange = () => { const f = importInput.files[0]; importInput.value = ''; if (f) importSubs(f); };
  return el('div', { class: 'insp-section' },
    el('h3', {}, 'Ondertitels'),
    el('p', { class: 'hint' }, v.subs.length
      ? `${v.subs.length} blok(ken) op de Ondertitels-track. Staat ook als .srt naast de render.`
      : 'Nog geen ondertitels. Maak ze uit de voice-over, importeer een .srt/.vtt of voeg losse blokken toe met "Ondertitel".'),
    el('div', { class: 'insp-actions' },
      el('button', { onclick: subsFromVo, disabled: !lines.length, title: lines.length ? '' : 'Voeg eerst VO-zinnen toe' }, icon('record_voice_over'), 'Uit voice-over'),
      el('label', { class: 'upload' }, icon('upload'), 'Importeer .srt/.vtt', importInput)),
    ...captionStyleFields());
}
async function importSubs(f) {
  const subs = parseSubtitles(await f.text());
  if (!subs.length) return toast('Geen ondertitels gevonden in dit bestand.', true);
  if (V().subs.length && !confirm(`De ${V().subs.length} bestaande ondertitels vervangen?`)) return;
  commit(v => { v.subs = subs; });
  const late = subs.filter(s => s.out > END()).length;
  toast(`${subs.length} ondertitels geïmporteerd${late ? ` (${late} lopen door na de eindkaart en worden afgekapt)` : ''}`);
}
const pickLocalFile = (accept, then) => { const i = el('input', { type: 'file', accept }); i.onchange = () => i.files[0] && then(i.files[0]); i.click(); };
function captionStyleFields() {
  const v = V(), b = brandOf();
  const cs = captionStyle(b, v);
  const T = { ...S.defaultTheme, ...(b.theme || {}) };
  const set = patch => v => { v.captions = { ...(v.captions || {}), ...patch }; };
  const own = Object.keys(v.captions || {}).some(k => k !== 'off');
  const color = (key, label, fallback) => {
    const input = el('input', { type: 'color', value: cs[key] || fallback });
    input.oninput = () => commit(set({ [key]: input.value }), { key: 'cap-' + key, refresh: 'timeline' });
    return el('label', { class: 'color-field' }, input, label);
  };
  return [
    check('Ondertitels tonen', !v.captions?.off, (x, v) => { set({ off: !x })(v); if (x) delete v.captions.off; }),
    el('div', { class: 'layout-grid cap-styles' }, ...Object.entries(captionStyles).map(([k, label]) =>
      el('button', { class: k === cs.style ? 'on' : '', title: captionStyleHints[k], onclick: () => commit(set({ style: k })) },
        el('span', { class: `cap-demo s-${k}` }, el('b', {}, 'Aa'), el('i', {}, 'bc')), label))),
    el('p', { class: 'hint' }, captionStyleHints[cs.style]),
    el('div', { class: 'field-row' },
      field('Grootte (px)', cs.size, (x, v) => set({ size: x })(v), { type: 'number', step: 2, min: 24, max: 200, key: 'cap-size' }),
      field('Woorden per keer', cs.words, (x, v) => set({ words: Math.max(1, Math.round(x)) })(v), { type: 'number', step: 1, min: 1, max: 12, key: 'cap-words' })),
    field(ownFormat() ? `Hoogte in beeld in ${fmtName()} (Y, px)` : 'Hoogte in beeld (Y, px)', capY(v), (x, v) => setCapY(v, x), { type: 'number', step: 10, min: 100, max: 1850, key: 'cap-y' + S.pf }),
    ownFormat()
      ? (v.captions?.pos?.[ownFormat()] != null
        ? el('p', { class: 'hint' }, `Eigen hoogte voor ${fmtName()}. `, el('a', { href: '#', onclick: e => { e.preventDefault(); commit(v => { delete v.captions.pos[ownFormat()]; }); } }, 'Terug naar de 9:16-hoogte'))
        : el('p', { class: 'hint' }, `Volgt 9:16. Sleep de ondertitel in deze preview om hem alleen in ${fmtName()} te verplaatsen.`))
      : el('p', { class: 'hint' }, 'Of sleep de ondertitel in de preview. Onder de 1580 px valt hij achter de TikTok-knoppen.' + (Object.keys(v.captions?.pos || {}).length ? ` Eigen hoogte in: ${Object.keys(v.captions.pos).join(', ')}.` : '')),
    el('div', { class: 'field-row' },
      check('HOOFDLETTERS', cs.upper, (x, v) => set({ upper: x })(v)),
      check('Zwarte rand', cs.outline, (x, v) => set({ outline: x })(v))),
    el('div', { class: 'color-grid' },
      color('color', 'Tekst', T.text),
      color('hi', 'Markering', T.accent),
      cs.style === 'box' ? color('ink', 'Tekst op blok', T.accentInk) : null),
    el('div', { class: 'insp-actions' },
      el('button', { onclick: () => saveCaptionsToBrand(cs), title: `Alle video's van ${b.name} krijgen deze stijl, tenzij ze zelf iets anders instellen` }, icon('palette'), 'Maak merkstandaard'),
      own ? el('button', { class: 'ghost', onclick: () => commit(v => { v.captions = v.captions?.off ? { off: true } : undefined; if (!v.captions) delete v.captions; }) }, icon('restart_alt'), 'Terug naar merkstijl') : null)
  ];
}
function saveCaptionsToBrand(cs) {
  const b = brandOf();
  const { off, ...style } = cs;
  b.captions = style;
  saveBrand(b);
  commit(v => { if (v.captions?.off) v.captions = { off: true }; else delete v.captions; });
  toast(`Ondertitelstijl opgeslagen voor merk ${b.name}`);
}
function subsFromVo() {
  const lines = V().vo.lines.filter(l => l.text?.trim());
  if (V().subs.length && !confirm(`De ${V().subs.length} bestaande ondertitels vervangen door de voice-over zinnen?`)) return;
  commit(v => { v.subs = voSubs(lines); });
  const unspoken = lines.filter(l => !l.len).length;
  toast(unspoken ? `Ondertitels gemaakt. ${unspoken} zin(nen) zijn nog niet ingesproken; hun lengte is geschat.` : 'Ondertitels gemaakt uit de voice-over.');
}
const voSubs = lines => lines.map(l => ({ t: l.t, out: round(l.t + (l.len || estLen(l.text))), text: l.text })).sort((a, b) => a.t - b.t);

// S: cut the selected clip or caption at the playhead (or, with nothing splittable selected, whatever is under it).
function splitAtPlayhead() {
  const t = round(S.t);
  const hit = (kind, j) => { const it = listOf(kind)?.[j]; if (!it) return false; const [a, b] = itemRange(kind, it, j); return t > a + 0.05 && t < b - 0.05; };
  let { kind, i } = S.sel || {};
  if (!['sub', 'clips', 'clips2'].includes(kind) || !hit(kind, i)) {
    kind = ['sub', 'clips', 'clips2'].find(k => (listOf(k) || []).some((_, j) => hit(k, j)));
    i = kind ? listOf(kind).findIndex((_, j) => hit(kind, j)) : -1;
  }
  if (!kind) return toast('Zet de playhead in een clip of ondertitel om te splitsen.');
  if (kind === 'sub') {
    const [a, b] = splitSub(listOf('sub')[i], t);
    if (!a.text || !b.text) return toast('Dit blok heeft maar één woord.');
    commit(v => v.subs.splice(i, 1, a, b));
  } else {
    commit(v => {
      const c = v[kind][i], d = round(t - c.start);
      const second = { ...c, start: t, dur: round(c.dur - d) };
      if (!isImage(c.src)) second.media = round((c.media || 0) + d * (c.rate || 1));
      c.dur = d;
      v[kind].splice(i + 1, 0, second);
    });
  }
  select({ kind, i: i + 1 }, false);
}

// ---------- brand editor (brands/<id>.json; applies to every video of that brand) ----------
function saveBrand(b) {
  $('#save-state').textContent = 'Merk opslaan…'; $('#save-state').className = 'busy';
  clearTimeout(S.brandTimer);
  S.brandTimer = setTimeout(async () => {
    try {
      await api(`/api/brands/${b.id}`, { method: 'PUT', body: JSON.stringify(b) });
      $('#save-state').textContent = 'Opgeslagen'; $('#save-state').className = 'muted';
      if (V()) reloadPreview();
    } catch (e) { toast(e.message, true); }
  }, 350);
}
const BRAND_COLORS = [['bg', 'Achtergrond'], ['text', 'Tekst'], ['accent', 'Accent'], ['accentInk', 'Tekst op accent'], ['markBg', 'Logo-vlak'], ['markInk', 'Logo-kleur'], ['glow', 'Gloed'], ['glow2', 'Gloed 2'], ['orbit', 'Ring'], ['orbit2', 'Ring 2'], ['deviceGlow', 'Apparaat-gloed'], ['deviceRing', 'Apparaat-rand']];
function brandPanel() {
  const b = brandOf();
  const T = { ...S.defaultTheme, ...(b.theme || {}) };
  const edit = (fn, rerender) => { fn(b); saveBrand(b); if (rerender) renderInspector(); };
  const bf = (label, value, set, opts = {}) => {
    const input = el(opts.textarea ? 'textarea' : 'input', { type: opts.type || 'text', ...(opts.placeholder && { placeholder: opts.placeholder }) });
    input.value = value ?? '';
    input.oninput = () => edit(b => set(opts.type === 'number' ? (input.value === '' ? undefined : +input.value) : input.value, b));
    return el('label', { class: 'field' }, el('span', {}, label), input);
  };
  const logoBox = el('div', { class: 'logo-preview', style: `background:${T.markBg || T.accent};color:${T.markInk || T.accentInk}` });
  if (b.logo) {
    if (/\.svg$/i.test(b.logo)) fetch(`/assets/brand/${encodeURIComponent(b.logo)}`).then(r => r.text()).then(svg => { logoBox.innerHTML = svg; });
    else logoBox.append(el('img', { src: `/assets/brand/${encodeURIComponent(b.logo)}` }));
  }
  const uploadBtn = (kind, label, accept) => {
    const input = el('input', { type: 'file', accept, hidden: true });
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try {
        const r = await fetch(`/api/upload?kind=${kind}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
        const data = await r.json(); if (!r.ok) throw new Error(data.error);
        await loadState();
        edit(b => { if (kind === 'logo') b.logo = data.name; else b.font = data.name; }, true);
      } catch (e) { toast(e.message, true); }
    };
    return el('label', { class: 'upload' }, icon('upload'), label, input);
  };
  const pills = [0, 1, 2].map(n => b.pills?.[n] || ['', '']);
  const chipCols = { ...(S.defaultChipColors || CHIP_COLORS), ...(b.chipColors || {}) };
  return [
    head('palette', 'Merk', el('button', { class: 'ghost icon', title: 'Terug naar video', onclick: () => select(null) }, icon('close'))),
    el('p', { class: 'hint' }, `Geldt voor alle video's met merk "${b.name}". Bestand: brands/${b.id}.json`),
    bf('Naam (eindkaart en bovenregel)', b.name, (x, b) => (b.name = x)),
    el('div', { class: 'field-row' },
      bf('Website / url', b.url, (x, b) => (b.url = x)),
      el('label', { class: 'field' }, el('span', {}, 'Taal'), (() => { const s = el('select', {}, ...[['en', 'Engels'], ['nl', 'Nederlands'], ['de', 'Duits'], ['fr', 'Frans'], ['es', 'Spaans']].map(([k, l]) => el('option', { value: k }, l))); s.value = b.lang || 'en'; s.onchange = () => edit(b => (b.lang = s.value)); return s; })())),
    el('div', { class: 'logo-row' }, logoBox,
      el('label', { class: 'field' }, el('span', {}, 'Logo'),
        (() => { const s = el('select', {}, el('option', { value: '' }, 'Geen'), ...S.logos.map(l => el('option', { value: l }, l))); s.value = b.logo || ''; s.onchange = () => edit(b => (b.logo = s.value || undefined), true); return s; })()),
      uploadBtn('logo', 'Upload', '.svg,.png,.jpg,.jpeg,.webp'),
      b.logo ? el('button', { class: 'ghost icon', title: `Logo-bestand ${b.logo} verwijderen`, onclick: () => deleteAsset('brand', b.logo) }, icon('delete')) : null),
    el('p', { class: 'hint' }, 'SVG met fill="currentColor" krijgt automatisch de logo-kleur.'),
    el('div', { class: 'path-row', style: 'align-items:end;margin-bottom:12px' },
      el('label', { class: 'field', style: 'flex:1;margin:0' }, el('span', {}, 'Lettertype'),
        (() => { const s = el('select', {}, ...S.fonts.map(f => el('option', { value: f }, f))); s.value = b.font || 'google-sans-flex-latin.woff2'; s.onchange = () => edit(b => (b.font = s.value)); return s; })()),
      uploadBtn('font', 'Upload', '.woff2,.woff,.ttf,.otf'),
      b.font && b.font !== 'google-sans-flex-latin.woff2' ? el('button', { class: 'ghost icon', title: `Lettertype ${b.font} verwijderen`, onclick: () => deleteAsset('fonts', b.font) }, icon('delete')) : null),
    el('h3', { class: 'mt' }, 'Kleuren'),
    el('div', { class: 'color-grid' }, ...BRAND_COLORS.map(([key, label]) => {
      const input = el('input', { type: 'color', value: T[key] || (key === 'markBg' ? T.accent : key === 'markInk' ? T.accentInk : '#888888') });
      input.oninput = () => edit(b => { b.theme = { ...(b.theme || {}), [key]: input.value }; });
      input.onchange = () => renderInspector();
      return el('label', { class: 'color-field' }, input, label);
    })),
    el('h3', { class: 'mt' }, 'Callout-kleuren'),
    el('div', { class: 'color-grid' }, ...Object.entries(chipCols).map(([name, [bg, ink]]) => {
      const input = el('input', { type: 'color', value: bg });
      input.oninput = () => edit(b => { b.chipColors = { ...(b.chipColors || {}), [name]: [input.value, ink] }; });
      return el('label', { class: 'color-field' }, input, name);
    })),
    el('h3', { class: 'mt' }, 'Eindkaart'),
    bf('Grootte naam (px)', b.endNameSize ?? 140, (x, b) => (b.endNameSize = x), { type: 'number' }),
    el('span', { class: 'hint' }, 'Knoppen onder de slogan (icoon + tekst, leeg = weg):'),
    ...pills.map((p, n) => el('div', { class: 'pill-row' },
      el('input', { value: p[0], placeholder: 'icoon', oninput: e => edit(b => { b.pills = [0, 1, 2].map(k => b.pills?.[k] || ['', '']); b.pills[n] = [e.target.value.trim(), b.pills[n][1]]; b.pills = b.pills.filter(x => x[1] || x[0]); }) }),
      el('input', { value: p[1], placeholder: 'tekst', oninput: e => edit(b => { b.pills = [0, 1, 2].map(k => b.pills?.[k] || ['', '']); b.pills[n] = [b.pills[n][0], e.target.value]; b.pills = b.pills.filter(x => x[1] || x[0]); }) }))),
    el('div', { class: 'insp-section' },
      el('h3', {}, 'Geavanceerd'),
      bf('Bestandsnaam-voorvoegsel voor renders', b.renderPrefix, (x, b) => (b.renderPrefix = x || undefined), { placeholder: `${b.id}-tiktok` }),
      bf('Extra CSS (voor bijzondere aanpassingen)', b.css, (x, b) => (b.css = x), { textarea: true, placeholder: '#end-name { letter-spacing: -2px; }' })),
    el('div', { class: 'insp-actions' },
      el('button', { onclick: () => newBrand(b.id) }, icon('content_copy'), 'Kopie als nieuw merk'),
      el('button', { onclick: () => newBrand() }, icon('add'), 'Nieuw merk'),
      b.id !== S.workspace.defaultBrand ? el('button', { onclick: async () => { applyState(await api('/api/workspace', { method: 'PUT', body: JSON.stringify({ defaultBrand: b.id }) })); renderInspector(); } }, icon('star'), 'Maak standaard') : null)
  ];
}
// A real dialog: window.prompt() does not exist in Electron.
const brandSlug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
function newBrand(from) {
  const dlg = $('#dlg-brand'), form = dlg.querySelector('form');
  form.from.replaceChildren(el('option', { value: '' }, 'Leeg startmerk'), ...S.brands.map(b => el('option', { value: b.id }, `Kopie van ${b.name}`)));
  form.from.value = from || '';
  form.name.value = ''; form.id.value = '';
  let idTouched = false;
  form.name.oninput = () => { if (!idTouched) form.id.value = brandSlug(form.name.value); };
  form.id.oninput = () => { idTouched = true; };
  $('#brand-error').textContent = '';
  dlg.showModal();
  form.onsubmit = async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const id = form.id.value.trim();
    try {
      applyState(await api('/api/brands', { method: 'POST', body: JSON.stringify({ id, name: form.name.value.trim(), from: form.from.value || undefined }) }));
      dlg.close();
      if (V()) commit(v => { v.brand = id; });
      else applyState(await api('/api/workspace', { method: 'PUT', body: JSON.stringify({ defaultBrand: id }) }));
      select({ kind: 'brand', i: 0 }, false);
      toast(`Merk "${form.name.value.trim()}" aangemaakt`);
    } catch (err) { $('#brand-error').textContent = err.message; }
  };
}

// ---------- fit, crop ----------
const screenOf = (v = V()) => S.screens?.[v ? layoutOf(v) : 'phone'] || [616, 1334];
// Natural pixel size of a clip source (images and videos alike), loaded once; `done` runs when it arrives.
function clipSize(name, done) {
  if (S.clipSize[name] !== undefined) return S.clipSize[name];
  S.clipSize[name] = null;
  const src = `/assets/clips/${encodeURIComponent(name)}`;
  const got = (w, h) => { if (w && h) { S.clipSize[name] = [w, h]; done?.(); } };
  if (isImage(name)) { const im = new Image(); im.onload = () => got(im.naturalWidth, im.naturalHeight); im.src = src; }
  else { const vd = document.createElement('video'); vd.preload = 'metadata'; vd.muted = true; vd.onloadedmetadata = () => got(vd.videoWidth, vd.videoHeight); vd.src = src; }
  return null;
}
// Same placement as the template (clipPlacement): scale k, share cut off per axis (cover) or left as border (contain).
function fitInfo(c, [sw, sh], [W, H]) {
  const r = c.crop?.w ? c.crop : { w: sw, h: sh };
  const contain = c.fit === 'contain';
  const k = contain ? Math.min(W / r.w, H / r.h) : Math.max(W / r.w, H / r.h);
  return { k, cutX: contain ? 0 : 1 - W / (r.w * k), cutY: contain ? 0 : 1 - H / (r.h * k), barX: contain ? 1 - r.w * k / W : 0, barY: contain ? 1 - r.h * k / H : 0 };
}
function fitNotes(c) {
  const [W, H] = screenOf();
  const name = (S.layouts[layoutOf()] || '').split(' (')[0].toLowerCase();
  const ideal = el('p', { class: 'hint' }, `Ideaal formaat voor ${name}: ${W * 2} × ${H * 2} px (of ${W} × ${H}). In Chrome: F12 → Ctrl+Shift+M → Responsive ${W} × ${H}, DPR 2 → ⋮ → Capture screenshot.`);
  const size = clipSize(c.src, () => { if (S.sel && selItem() === c) renderInspector(); });
  if (!size) return [ideal];
  const f = fitInfo(c, size, [W, H]);
  const pct = x => `${Math.round(x * 100)}%`;
  const msgs = [];
  if (f.cutY > 0.02) msgs.push(`de onderste ${pct(f.cutY)} valt weg`);
  if (f.cutX > 0.02) msgs.push(`links en rechts valt elk ${pct(f.cutX / 2)} weg`);
  if (f.barX > 0.02) msgs.push(`links en rechts komt een rand van elk ${pct(f.barX / 2)}`);
  if (f.barY > 0.02) msgs.push(`boven en onder komt een rand van elk ${pct(f.barY / 2)}`);
  if (f.k > 1.05) msgs.push(`het wordt ${f.k.toFixed(1)}× vergroot en daardoor minder scherp`);
  const what = c.crop?.w ? `Uitsnede ${Math.round(c.crop.w)} × ${Math.round(c.crop.h)}` : `${size[0]} × ${size[1]} px`;
  return [el('p', { class: `fit ${msgs.length ? 'warn' : 'ok'}` }, icon(msgs.length ? 'warning' : 'check_circle'), el('span', {}, msgs.length ? `${what}: ${msgs.join(', ')}.` : `${what}: past precies.`)), ideal];
}
function placeControls(k, i, c) {
  return [
    el('label', { class: 'field' }, el('span', {}, 'Plaatsing in het scherm'),
      el('div', { class: 'seg' },
        el('button', { class: c.fit !== 'contain' ? 'on' : '', title: 'Vult het hele scherm; wat niet past valt weg (bovenkant blijft staan)', onclick: () => commit(v => { delete v[k][i].fit; }) }, icon('crop_free'), 'Vullen'),
        el('button', { class: c.fit === 'contain' ? 'on' : '', title: 'Alles blijft zichtbaar; de rest van het scherm krijgt de achtergrondkleur', onclick: () => commit(v => { v[k][i].fit = 'contain'; }) }, icon('fit_screen'), 'Passend'),
        el('button', { title: 'Kies zelf welk deel in beeld komt', onclick: () => openCrop(k, i) }, icon('crop'), c.crop ? 'Uitsnede…' : 'Bijsnijden…'),
        c.crop ? el('button', { class: 'ghost', title: 'Uitsnede weghalen', onclick: () => commit(v => { delete v[k][i].crop; }) }, icon('restart_alt')) : null)),
    ...fitNotes(c)
  ];
}

// Crop window: drag the frame (or its corners) over the source. Locked to the screen's shape by default, so the
// crop fills the device exactly; unlocked, "Vullen"/"Passend" decide how the crop sits in the screen.
async function openCrop(k, i) {
  const c = V()[k][i];
  const [W, H] = screenOf(), ar = W / H;
  const src = `/assets/clips/${encodeURIComponent(c.src)}`;
  const media = isImage(c.src) ? el('img', { src, draggable: false, alt: '' }) : el('video', { src, muted: true, preload: 'auto', playsInline: true });
  try {
    await new Promise((ok, fail) => {
      media.onerror = fail;
      if (media.tagName === 'IMG') media.onload = ok;
      else media.onloadeddata = () => { media.onseeked = ok; media.currentTime = Math.max(0.01, c.media || 0); };
    });
  } catch { return toast('Kon de bron niet laden.', true); }
  const sw = media.naturalWidth || media.videoWidth, sh = media.naturalHeight || media.videoHeight;
  const ds = Math.min(Math.min(900, innerWidth - 120) / sw, Math.max(200, innerHeight - 300) / sh);
  const dw = Math.round(sw * ds), dh = Math.round(sh * ds);
  media.style.cssText = `width:${dw}px;height:${dh}px`;
  const box = el('div', { class: 'crop-box' }, ...['nw', 'ne', 'sw', 'se'].map(h => el('i', { class: `h-${h}`, 'data-h': h })));
  $('#crop-stage').replaceChildren(el('div', { class: 'crop-canvas', style: `width:${dw}px;height:${dh}px` }, media, box));
  const maxRect = () => { let w = sw, h = sw / ar; if (h > sh) { h = sh; w = sh * ar; } return { x: (sw - w) / 2, y: 0, w, h }; };
  const own = c.crop?.w && c.crop.sw === sw && c.crop.sh === sh;
  let r = own ? { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h } : maxRect();
  const lock = $('#crop-lock');
  lock.checked = !own || Math.abs(r.w / r.h - ar) < 0.01;
  $('#crop-ratio').textContent = `${W} : ${H}`;
  $('#crop-hint').textContent = `${c.src} · ${sw} × ${sh} px. Sleep het kader of de hoeken. Het deel binnen het kader komt in het ${(S.layouts[layoutOf()] || 'scherm').split(' (')[0].toLowerCase()}.`;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const draw = () => {
    box.style.cssText = `left:${r.x * ds}px;top:${r.y * ds}px;width:${r.w * ds}px;height:${r.h * ds}px`;
    const f = fitInfo({ fit: c.fit, crop: r }, [sw, sh], [W, H]);
    $('#crop-info').textContent = `${Math.round(r.w)} × ${Math.round(r.h)} px${f.k > 1.05 ? ` · wordt ${f.k.toFixed(1)}× vergroot (minder scherp)` : ' · scherp'}`;
    $('#crop-info').className = f.k > 1.05 ? 'warn-text' : 'muted';
  };
  const toAspect = () => {
    if (r.w / r.h > ar) { const w = r.h * ar; r.x += (r.w - w) / 2; r.w = w; } else r.h = r.w / ar;
    draw();
  };
  lock.onchange = () => { if (lock.checked) toAspect(); };
  box.onpointerdown = e => {
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    const h = e.target.dataset.h || 'move', o = { ...r }, x0 = e.clientX, y0 = e.clientY;
    box.onpointermove = ev => {
      const dx = (ev.clientX - x0) / ds, dy = (ev.clientY - y0) / ds;
      if (h === 'move') { r.x = clamp(o.x + dx, 0, sw - o.w); r.y = clamp(o.y + dy, 0, sh - o.h); return draw(); }
      // Resize from a corner; the opposite corner stays put.
      const west = h.includes('w'), north = h.includes('n');
      const ax = west ? o.x + o.w : o.x, ay = north ? o.y + o.h : o.y;
      const px = clamp((west ? o.x : o.x + o.w) + dx, 0, sw), py = clamp((north ? o.y : o.y + o.h) + dy, 0, sh);
      let w = Math.max(20, Math.abs(px - ax)), hh = Math.max(20, Math.abs(py - ay));
      if (lock.checked) {
        const mw = west ? ax : sw - ax, mh = north ? ay : sh - ay;
        if (w / hh > ar) hh = w / ar; else w = hh * ar;
        if (w > mw) { w = mw; hh = w / ar; }
        if (hh > mh) { hh = mh; w = hh * ar; }
      }
      r = { x: west ? ax - w : ax, y: north ? ay - hh : ay, w, h: hh };
      draw();
    };
    box.onpointerup = () => { box.onpointermove = null; };
  };
  draw();
  const dlg = $('#dlg-crop');
  const close = () => { dlg.close(); $('#crop-stage').replaceChildren(); };
  $('#crop-all').onclick = () => { lock.checked = false; r = { x: 0, y: 0, w: sw, h: sh }; draw(); };
  $('#crop-cancel').onclick = close;
  $('#crop-ok').onclick = () => {
    const full = r.x < 1 && r.y < 1 && r.w > sw - 1 && r.h > sh - 1;
    commit(v => { const cc = v[k][i]; if (full) delete cc.crop; else cc.crop = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), sw, sh }; });
    close();
    toast(full ? 'Uitsnede weggehaald' : 'Uitsnede toegepast');
  };
  dlg.showModal();
}

// Moves a file to <folder>/.trash; the server unlinks it from every video and brand that used it.
async function deleteAsset(kind, name) {
  try {
    const { videos, brands } = await api(`/api/assets/${kind}/${encodeURIComponent(name)}/usage`);
    const uses = [...videos.map(id => `video ${id}`), ...brands.map(b => `merk ${b}`)];
    const effect = { clips: 'De clip verdwijnt uit', vo: 'Het spoor verdwijnt uit', brand: 'Het logo verdwijnt uit', fonts: 'Het lettertype valt terug op het standaardlettertype in' }[kind];
    if (!confirm(`"${name}" verwijderen?\n${uses.length ? `${effect}: ${uses.join(', ')}.` : 'Het wordt nergens gebruikt.'}\nHet bestand gaat naar een .trash-map in het project, dus je kunt het nog terugzetten.`)) return;
    if (S.listening?.name === name) { S.listening.audio.pause(); S.listening = null; }
    if (S.saveTimer) await flushSave();
    const r = await api(`/api/assets/${kind}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    applyState(r);
    // The server rewrote this video: take its version, and drop undo steps that would bring the file back.
    if (V() && r.changed.includes(S.id)) { S.spec = await api(`/api/videos/${S.id}`); S.history = []; S.future = []; }
    if (V() && (r.changed.includes(S.id) || r.brands.length)) reloadPreview();
    if (S.sel && S.sel.kind !== 'brand' && V() && !selItem()) S.sel = null;
    if (V()) renderAll(); else { renderInspector(); renderLibrary(); }
    toast(`${name} verwijderd${uses.length ? ` (uit ${uses.join(', ')})` : ''}`);
  } catch (e) { toast(e.message, true); }
}

function clipPanel(k, i, c) {
  if (isImage(c.src)) return [
    head('image', k === 'clips2' ? 'Afbeelding · telefoon 2' : 'Afbeelding'),
    selectField('Bron', c.src, S.clips.map(n => [n, n]), (x, v) => { v[k][i].src = x; delete v[k][i].crop; }),
    el('img', { class: 'src-preview', src: `/assets/clips/${c.src}` }),
    ...placeControls(k, i, c),
    el('p', { class: 'hint' }, 'Combineer met een zoom voor beweging.'),
    el('div', { class: 'field-row' },
      field('Start in video (s)', c.start, (x, v) => (v[k][i].start = x), { type: 'number', step: 0.05, min: 0 }),
      field('Duur (s)', c.dur, (x, v) => (v[k][i].dur = x), { type: 'number', step: 0.05, min: 0.1 })),
    actions()
  ];
  const rate = c.rate || 1;
  const srcDur = S.clipDur[c.src];
  const vid = el('video', { class: 'src-preview', src: `/assets/clips/${c.src}`, muted: true, preload: 'auto', playsInline: true });
  vid.addEventListener('loadedmetadata', () => { S.clipDur[c.src] = vid.duration; vid.currentTime = c.media; slider.max = vid.duration.toFixed(2); });
  const slider = el('input', { type: 'range', min: 0, max: srcDur ? srcDur.toFixed(2) : 60, step: 0.05, value: c.media, style: 'width:100%' });
  slider.addEventListener('input', () => { vid.currentTime = +slider.value; commit(v => (v[k][i].media = +slider.value), { key: 'media' + k + i, refresh: 'timeline' }); mediaInput.querySelector('input').value = slider.value; });
  const mediaInput = field('Begin in bron (s)', c.media, (x, v) => { v[k][i].media = x; vid.currentTime = x; slider.value = x; }, { type: 'number', step: 0.05, min: 0 });
  const used = c.media + c.dur * rate;
  return [
    head('movie', k === 'clips2' ? 'Clip · telefoon 2' : 'Clip'),
    selectField('Bron', c.src, S.clips.map(n => [n, n]), (x, v) => { v[k][i].src = x; delete v[k][i].crop; }),
    vid, slider,
    el('p', { class: 'hint' }, 'Schuif om het beginpunt in de opname te kiezen.'),
    ...placeControls(k, i, c),
    el('div', { class: 'field-row' },
      field('Start in video (s)', c.start, (x, v) => (v[k][i].start = x), { type: 'number', step: 0.05, min: 0 }),
      field('Duur (s)', c.dur, (x, v) => (v[k][i].dur = x), { type: 'number', step: 0.05, min: 0.1 })),
    el('div', { class: 'field-row' },
      mediaInput,
      field('Snelheid', rate, (x, v) => { if (x === 1) delete v[k][i].rate; else v[k][i].rate = x; }, { type: 'number', step: 0.25, min: 0.25, max: 4 })),
    srcDur && used > srcDur + 0.05 ? el('p', { class: 'warn' }, `Let op: de clip loopt ${(used - srcDur).toFixed(1)}s voorbij het einde van de opname (${srcDur.toFixed(1)}s).`) : null,
    actions()
  ];
}

function chipPanel(i, c) {
  const palette = chipColors();
  const [bg, ink] = palette[c.color] || Object.values(palette)[0];
  const demo = el('div', { class: 'chip-demo' },
    el('span', { class: 'ci', style: `background:${bg};color:${ink}` }, icon(c.icon)),
    el('span', {}, el('div', { class: 'cl', style: `color:${bg}` }), el('div', { class: 'ct' })));
  // Update the example chip in place; re-rendering the panel would steal focus from the field being typed in.
  const refresh = () => {
    const cur = V().chips[i];
    demo.querySelector('.cl').textContent = cur.label;
    demo.querySelector('.ct').textContent = cur.count != null ? Number(cur.count).toLocaleString('en-US') + (cur.suffix || '') : cur.text;
  };
  refresh();
  const iconGrid = el('div', { class: 'icon-grid' }, ...ICONS.map(n => el('button', { class: n === c.icon ? 'on' : '', title: n, onclick: () => commit(v => (v.chips[i].icon = n)) }, icon(n))));
  return [
    head('sell', 'Callout'),
    demo,
    el('div', { class: 'field-row' },
      field('Label (klein)', c.label, (x, v) => (v.chips[i].label = x), { after: refresh }),
      field('Tekst', c.text, (x, v) => (v.chips[i].text = x), { after: refresh })),
    el('label', { class: 'field' }, el('span', {}, 'Kleur'), el('div', { class: 'swatches' }, ...Object.entries(palette).map(([name, [b]]) =>
      el('button', { class: `swatch${c.color === name ? ' on' : ''}`, style: `background:${b}`, title: name, onclick: () => commit(v => (v.chips[i].color = name)) })))),
    el('label', { class: 'field' }, el('span', {}, 'Icoon'),
      el('input', { value: c.icon, placeholder: 'material symbol naam', onchange: e => commit(v => (v.chips[i].icon = e.target.value.trim())) }), iconGrid),
    el('p', { class: 'hint' }, 'Elke naam van fonts.google.com/icons werkt; het icoon-font wordt automatisch bijgewerkt.'),
    el('div', { class: 'field-row' },
      field('In (s)', c.t, (x, v) => (v.chips[i].t = x), { type: 'number', step: 0.05, min: 0 }),
      field('Uit (s)', c.out, (x, v) => (v.chips[i].out = x), { type: 'number', step: 0.05, min: 0 })),
    el('div', { class: 'field-row' },
      field(ownFormat() ? `X in ${S.pf} (px)` : 'X (px)', chipAt(c).x, (x, v) => setChipPos(v, i, x, chipAt(v.chips[i]).y), { type: 'number', step: 10, key: 'chipx' + i + S.pf }),
      field(ownFormat() ? `Y in ${S.pf} (px)` : 'Y (px)', chipAt(c).y, (y, v) => setChipPos(v, i, chipAt(v.chips[i]).x, y), { type: 'number', step: 10, key: 'chipy' + i + S.pf })),
    ownFormat()
      ? (c.pos?.[ownFormat()]
        ? el('p', { class: 'hint' }, `Eigen positie voor ${fmtName()}. `, el('a', { href: '#', onclick: e => { e.preventDefault(); commit(v => { delete v.chips[i].pos[ownFormat()]; if (!Object.keys(v.chips[i].pos).length) delete v.chips[i].pos; }); } }, 'Terug naar de 9:16-positie'))
        : el('p', { class: 'hint' }, `Volgt 9:16. Sleep de callout in deze preview om hem alleen in ${fmtName()} te verplaatsen.`))
      : el('p', { class: 'hint' }, 'Of sleep de callout in de preview.' + (Object.keys(c.pos || {}).length ? ` Eigen positie in: ${Object.keys(c.pos).join(', ')}.` : '')),
    check('Live-stip (knippert)', c.live, (x, v) => { if (x) v.chips[i].live = true; else delete v.chips[i].live; }),
    check('Optellend getal', c.count != null, (x, v) => { if (x) { v.chips[i].count = parseInt(String(c.text).replace(/\D/g, '')) || 1000; v.chips[i].suffix ??= ''; } else { delete v.chips[i].count; delete v.chips[i].suffix; } }),
    c.count != null ? el('div', { class: 'field-row' },
      field('Telt tot', c.count, (x, v) => (v.chips[i].count = x), { type: 'number', step: 1, after: refresh }),
      field('Achtervoegsel', c.suffix, (x, v) => (v.chips[i].suffix = x), { after: refresh })) : null,
    actions()
  ];
}

// ---------- jobs ----------
async function runJob(kind, title, { id = S.id, body } = {}) {
  if (S.saveTimer) await flushSave();
  const dlg = $('#dlg-job');
  $('#job-title').textContent = title;
  $('#job-log').textContent = ''; $('#job-result').replaceChildren(); $('#job-bar').style.width = '0';
  dlg.showModal();
  try { await api(`/api/${kind}/${id}`, { method: 'POST', ...(body && { body: JSON.stringify(body) }) }); } catch (e) { $('#job-log').textContent = e.message; return; }
  for (;;) {
    await new Promise(r => setTimeout(r, 800));
    const job = await api(`/api/${kind}/${id}`);
    $('#job-bar').style.width = `${job.progress || 3}%`;
    const log = $('#job-log');
    log.textContent = (job.log || []).join('\n');
    log.scrollTop = log.scrollHeight;
    if (job.state !== 'running') return job;
  }
}
const fileLinks = files => files.flatMap((f, n) => [n ? ', ' : '', el('a', { href: `/renders/${f}`, download: f }, f)]);
async function renderMp4() {
  const job = await runJob('render', `Renderen: ${S.id}`);
  if (job?.state === 'done') {
    const { file, files = [file], srt } = job.result;
    $('#job-result').replaceChildren(
      el('video', { src: `/renders/${file}?${Date.now()}`, controls: true }),
      el('p', {}, 'Klaar! ', fileLinks([...files, ...(srt ? [srt] : [])]), ` staan in renders/${S.settings.copyToDownloads !== false ? ' en in Downloads' : ''}.`));
  } else if (job) $('#job-result').replaceChildren(el('p', { class: 'error' }, 'Renderen mislukt, zie het log hierboven.'));
}
// Batch: pick videos, the server renders them one after another (each in its own formats).
function openBatch() {
  if (!S.workspace || !S.list.length) return;
  const dlg = $('#dlg-batch');
  const checks = S.list.map(v => {
    const box = el('input', { type: 'checkbox', checked: true, value: v.id });
    return el('label', { class: 'check batch-row' }, box, el('b', {}, v.id), el('span', { class: 'muted' }, v.overline || ''), el('i', {}, (v.formats || ['9:16']).join(' · ')));
  });
  $('#batch-list').replaceChildren(...checks);
  $('#batch-error').textContent = '';
  const set = on => checks.forEach(c => (c.querySelector('input').checked = on));
  $('#batch-all').onclick = () => set(true);
  $('#batch-none').onclick = () => set(false);
  $('#batch-cancel').onclick = () => dlg.close();
  $('#batch-go').onclick = async () => {
    const ids = checks.map(c => c.querySelector('input')).filter(i => i.checked).map(i => i.value);
    if (!ids.length) return ($('#batch-error').textContent = 'Kies minstens één video.');
    dlg.close();
    const job = await runJob('batch', `${ids.length} video('s) renderen`, { id: 'all', body: { ids } });
    if (!job) return;
    const results = job.result?.results || [];
    $('#job-result').replaceChildren(...results.map(r => el('p', { class: r.error ? 'error' : '' }, el('b', {}, r.id), ': ', r.error ? r.error : fileLinks([...r.files, ...(r.srt ? [r.srt] : [])]))),
      el('p', { class: 'muted' }, `Alles staat in renders/${S.settings.copyToDownloads !== false ? ' en in Downloads' : ''}.`));
  };
  dlg.showModal();
}

function setPreviewFormat(k) { S.pf = k; try { localStorage.setItem('ms-pf', k); } catch {} renderFormatBar(); fitStage(); if (V()) { reloadPreview(); renderInspector(); } }
function zoomTimeline(f) { S.pps = Math.max(20, Math.min(240, S.pps * f)); $('#tl-zoom').value = S.pps; try { localStorage.setItem('ms-pps', S.pps); } catch {} renderTimeline(); }
const revealRenders = () => api('/api/workspace/reveal', { method: 'POST', body: JSON.stringify({ what: 'renders' }) });

// ---------- menu bar ----------
function showShortcuts() {
  const rows = [['Spatie', 'Afspelen / pauzeren'], ['← / →', '1 frame terug / verder'], ['Shift+← / →', '1 seconde terug / verder'], ['Home / End', 'Naar begin / einde'],
    ['S', 'Splitsen op playhead (clip of ondertitel)'], ['Del', 'Geselecteerd item verwijderen'], ['Ctrl+D', 'Dupliceren'], ['Ctrl+Z / Ctrl+Shift+Z', 'Ongedaan maken / opnieuw'],
    ['Ctrl+C / X / V', 'Kopiëren / knippen / plakken op playhead (ook tussen video\'s)'], ['Ctrl+Shift+V', 'Plakken op dezelfde tijd'], ['Ctrl+A', 'Alles selecteren'], ['Ctrl+klik', 'Meer items selecteren'],
    ['M', 'Marker op playhead (nog eens = weg)'], ['[ / ]', 'Naar vorige / volgende marker of beat'], ['Esc', 'Deselecteren'], ['Ctrl+N', 'Nieuwe video'], ['Ctrl+O', 'Projecten'], ['Ctrl+R', 'Render MP4'], ['Ctrl+Shift+B', 'Batch renderen'], ['Ctrl+scroll', 'Tijdlijn in-/uitzoomen'], ['Alt of F10', 'Menubalk']];
  $('#keys-list').replaceChildren(...rows.map(([k, d]) => el('div', { class: 'key-row' }, el('kbd', {}, k), el('span', {}, d))));
  $('#dlg-keys').showModal();
}
function buildMenus() {
  const hasV = () => !!V();
  const item = S => S && S.kind !== 'brand' && S.kind !== 'end';
  const canRemove = () => hasV() && item(S.sel) && !!selItem();
  const canDup = () => canRemove() && !['audio', 'music'].includes(S.sel.kind);
  const step = d => () => { S.player?.pause(); seek(S.t + d); };
  const play = (label, key, run, extra = {}) => ({ label, key, run, disabled: !hasV(), ...extra });
  const hasClip = () => { try { return !!JSON.parse(localStorage.getItem('ms-clip') || 'null')?.items?.length; } catch { return false; } };
  menubar($('#menubar'), [
    { label: 'Bestand', items: () => [
      { label: 'Nieuwe video…', key: 'Ctrl+N', icon: 'add', run: () => newVideo(), disabled: !S.workspace },
      { label: 'Video dupliceren…', key: 'Ctrl+Shift+D', icon: 'content_copy', run: () => newVideo(S.id), disabled: !hasV() },
      { label: 'Video verwijderen…', icon: 'delete', run: () => deleteVideo(), disabled: !hasV() },
      { sep: true },
      { label: 'Projecten…', key: 'Ctrl+O', icon: 'folder_open', run: openProjects },
      { label: 'Media uploaden…', icon: 'upload', run: () => $('#upload').click(), disabled: !S.workspace },
      { label: 'Rendermap openen', key: 'Ctrl+Shift+R', icon: 'folder', run: revealRenders, disabled: !S.workspace },
      { sep: true },
      { label: 'Instellingen…', key: 'Ctrl+,', icon: 'settings', run: openSettings },
      bridge && { sep: true },
      bridge && { label: 'Afsluiten', key: 'Alt+F4', run: () => window.close() }
    ] },
    { label: 'Bewerken', items: () => [
      { label: 'Ongedaan maken', key: 'Ctrl+Z', icon: 'undo', run: undo, disabled: !S.history.length },
      { label: 'Opnieuw', key: 'Ctrl+Shift+Z', icon: 'redo', run: redo, disabled: !S.future.length },
      { sep: true },
      { label: 'Knippen', key: 'Ctrl+X', icon: 'content_cut', run: () => copySel(true), disabled: !selectedRefs().length },
      { label: 'Kopiëren', key: 'Ctrl+C', icon: 'content_copy', run: () => copySel(false), disabled: !selectedRefs().length },
      { label: 'Plakken op playhead', key: 'Ctrl+V', icon: 'content_paste', run: () => pasteClip(false), disabled: !hasV() || !hasClip() },
      { label: 'Plakken op dezelfde tijd', key: 'Ctrl+Shift+V', run: () => pasteClip(true), disabled: !hasV() || !hasClip() },
      { label: 'Alles selecteren', key: 'Ctrl+A', icon: 'select_all', run: selectAll, disabled: !hasV() },
      { sep: true },
      { label: 'Dupliceren', key: 'Ctrl+D', icon: 'control_point_duplicate', run: duplicateSel, disabled: !canDup() },
      { label: 'Splitsen op playhead', key: 'S', icon: 'call_split', run: splitAtPlayhead, disabled: !hasV() },
      { label: 'Verwijderen', key: 'Del', icon: 'delete', run: removeSel, disabled: !canRemove() },
      { label: 'Deselecteren', key: 'Esc', run: () => select(null), disabled: !S.sel },
      { sep: true },
      { label: 'Merk bewerken…', icon: 'palette', run: () => select({ kind: 'brand', i: 0 }, false), disabled: !S.workspace }
    ] },
    { label: 'Invoegen', items: () => [
      ...[['head', 'Tekst', 'title'], ['chips', 'Callout', 'sell'], ['zoom', 'Zoom', 'zoom_in'], ['tap', 'Tik', 'touch_app'], ['vo', 'Voice-over zin', 'record_voice_over'], ['sub', 'Ondertitel', 'subtitles']]
        .map(([k, label, ic]) => ({ label, icon: ic, run: () => add(k), disabled: !hasV() })),
      { label: 'Marker op playhead', key: 'M', icon: 'bookmark', run: toggleMarker, disabled: !hasV() },
      { label: 'Tik-modus (klik = tik)', key: 'T', icon: 'ads_click', checked: !!S.tapMode, run: () => setTapMode(!S.tapMode), disabled: !hasV() },
      { sep: true },
      { label: 'Ondertitels uit voice-over', run: subsFromVo, disabled: !hasV() || !V().vo.lines.some(l => l.text?.trim()) },
      { label: 'Ondertitels importeren (.srt / .vtt)…', run: () => pickLocalFile('.srt,.vtt', importSubs), disabled: !hasV() },
      { sep: true },
      { label: 'Media uploaden…', icon: 'upload', run: () => $('#upload').click(), disabled: !S.workspace }
    ] },
    { label: 'Beeld', items: () => [
      { header: 'Preview-formaat' },
      ...Object.entries(S.formats || {}).map(([k, f]) => ({ label: f.label, checked: S.pf === k, run: () => setPreviewFormat(k) })),
      { sep: true },
      { label: 'TikTok-veilige zone', checked: $('#safe-toggle').checked, disabled: S.pf !== '9:16', run: () => $('#safe-toggle').click() },
      { sep: true },
      { label: 'Beats van de muziek (tonen + snappen)', checked: !!S.snapBeats, run: () => $('#beats-toggle').click(), disabled: !hasV() },
      { label: 'Tijdlijn inzoomen', icon: 'zoom_in', key: 'Ctrl+scroll', run: () => zoomTimeline(1.25) },
      { label: 'Tijdlijn uitzoomen', icon: 'zoom_out', run: () => zoomTimeline(0.8) },
      bridge && { sep: true },
      bridge && { label: 'Volledig scherm', key: 'F11', icon: 'fullscreen', run: () => bridge.window?.('fullscreen') },
      bridge && { label: 'Herladen', key: 'F5', run: () => location.reload() },
      bridge && { label: 'Ontwikkelaarstools', key: 'Ctrl+Shift+I', run: () => bridge.window?.('devtools') }
    ] },
    { label: 'Afspelen', items: () => [
      play(S.playing ? 'Pauzeren' : 'Afspelen', 'Spatie', togglePlay, { icon: S.playing ? 'pause' : 'play_arrow' }),
      { sep: true },
      play('Naar begin', 'Home', () => seek(0), { icon: 'skip_previous' }),
      play('Naar einde', 'End', () => seek(DUR())),
      { sep: true },
      play('Vorige marker / beat', '[', () => jumpMarker(-1)),
      play('Volgende marker / beat', ']', () => jumpMarker(1)),
      { sep: true },
      play('1 frame terug', '←', step(-1 / FPS)),
      play('1 frame verder', '→', step(1 / FPS)),
      play('1 seconde terug', 'Shift+←', step(-1)),
      play('1 seconde verder', 'Shift+→', step(1))
    ] },
    { label: 'Exporteren', items: () => [
      { label: 'Render MP4', key: 'Ctrl+R', icon: 'movie', run: renderMp4, disabled: !hasV() },
      { label: 'Batch renderen…', key: 'Ctrl+Shift+B', icon: 'video_library', run: openBatch, disabled: !S.list.length },
      { sep: true },
      { label: 'Voice-over maken', icon: 'graphic_eq', run: generateVo, disabled: !hasV() || !V().vo.lines.length },
      { sep: true },
      { label: 'Rendermap openen', icon: 'folder', run: revealRenders, disabled: !S.workspace }
    ] },
    { label: 'Help', items: () => [
      { label: 'Sneltoetsen', icon: 'keyboard', run: showShortcuts },
      { label: 'Over Motion Studio', icon: 'info', run: () => toast('Motion Studio · editor voor korte motion-graphics video\'s, rendert met HyperFrames') }
    ] }
  ]);
  // The video list: duplicate/delete per video, a new video at the bottom.
  dropdownExtras['video-select'] = {
    actions: id => [
      { icon: 'content_copy', title: `${id} dupliceren`, run: () => newVideo(id) },
      { icon: 'delete', title: `${id} verwijderen`, danger: true, run: () => deleteVideo(id) }
    ],
    footer: () => (S.workspace ? [{ icon: 'add', label: 'Nieuwe video…', run: () => newVideo() }] : [])
  };
}

// Preview format buttons above the stage; a dot marks the formats this video renders to.
function renderFormatBar() {
  const bar = $('#format-bar');
  if (!bar || !S.formats) return;
  const on = new Set(V()?.formats?.length ? V().formats : ['9:16']);
  bar.replaceChildren(...Object.entries(S.formats).map(([k, f]) => el('button', {
    class: `${k === S.pf ? 'on' : ''}${on.has(k) ? ' will' : ''}`, title: `Preview in ${f.label} (${f.w}×${f.h})${on.has(k) ? ' · wordt gerenderd' : ''}`,
    onclick: () => setPreviewFormat(k)
  }, k)));
  const tall = S.pf === '9:16';
  $('#safe-toggle').disabled = !tall;
  $('#safe-zone').hidden = !tall || !$('#safe-toggle').checked;
}

async function generateVo() {
  const job = await runJob('vo', 'Voice-over maken');
  if (job?.state === 'done') {
    S.history.push(clone(V()));
    V().audio = job.result.audio; V().vo.lines = job.result.lines;
    // First voice-over for this video: captions come along for free (they stay editable afterwards).
    const autoSubs = !V().subs?.length;
    if (autoSubs) V().subs = voSubs(V().vo.lines.filter(l => l.text?.trim()));
    await loadState();
    renderAll(); scheduleSave();
    $('#job-result').replaceChildren(el('p', {}, `Klaar. ${job.result.audio} is nu het audiospoor. De lengte van elke zin staat op de tijdlijn.${autoSubs ? ' De ondertitels zijn er meteen bij gemaakt.' : ' Klik op "Uit voice-over" om de ondertitels bij te werken.'}`));
  }
}

// ---------- video management ----------
const STARTER = {
  en: { overline: 'New video', heads: ['Your hook *goes here.*', 'Second *point.*'], tagline: 'Your tagline, *here.*' },
  nl: { overline: 'Nieuwe video', heads: ['Je hook *hier.*', 'Tweede *punt.*'], tagline: 'Jouw slogan, *hier.*' }
};
function blankSpec(brandId, layout = 'phone') {
  const b = S.brands.find(x => x.id === brandId) || brandOf({});
  const t = STARTER[b.lang] || STARTER.en;
  const first = S.clips[0];
  return {
    brand: brandId, layout, overline: t.overline, dur: 15, end: 12.6,
    heads: [{ t: 0, text: t.heads[0], hook: true }, { t: 2.3, text: t.heads[1] }],
    clips: first ? [{ src: first, start: 0.9, dur: isImage(first) ? 3 : 11.7, media: 0 }] : [],
    chips: [], zooms: [], tagline: t.tagline
  };
}
function newVideo(baseId) {
  if (!S.workspace) return openProjects();
  const dlg = $('#dlg-new'), form = dlg.querySelector('form');
  form.base.replaceChildren(el('option', { value: '' }, 'Leeg sjabloon'), ...S.list.map(v => el('option', { value: v.id }, `Kopie van ${v.id}`)));
  form.base.value = baseId || '';
  form.brand.replaceChildren(...S.brands.map(b => el('option', { value: b.id }, b.name)));
  form.brand.value = (baseId && S.list.find(v => v.id === baseId)?.brand) || S.workspace.defaultBrand || S.brands[0]?.id;
  form.id.value = baseId ? `${baseId}-2` : '';
  $('#new-error').textContent = '';
  dlg.showModal();
  form.onsubmit = async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    try {
      const spec = form.base.value ? await api(`/api/videos/${form.base.value}`) : blankSpec(form.brand.value, V() ? layoutOf() : 'phone');
      spec.brand = form.brand.value;
      const made = await api('/api/videos', { method: 'POST', body: JSON.stringify({ id: form.id.value.trim(), spec }) });
      dlg.close();
      await loadState();
      openVideo(made.id);
    } catch (err) { $('#new-error').textContent = err.message; }
  };
}
async function deleteVideo(id = S.id) {
  if (!id || !confirm(`Video "${id}" verwijderen?\nHet bestand gaat naar specs/.trash, dus je kunt het nog terugzetten. Renders blijven staan.`)) return;
  try {
    if (id === S.id && S.saveTimer) await flushSave();
    await api(`/api/videos/${id}`, { method: 'DELETE' });
    await loadState();
    if (id === S.id) openFirst();
    toast(`Video ${id} verwijderd`);
  } catch (e) { toast(e.message, true); }
}
// Empty project: nothing to show until the first video exists.
function showEmpty() {
  S.spec = null; S.id = null; S.player = null;
  document.querySelectorAll('.pv').forEach(f => (f.src = 'about:blank'));
  $('#tl-rows').replaceChildren(); $('#tl-ruler').replaceChildren();
  S.sel = null;
  renderInspector();
  renderLibrary();
}
function emptyPanel() {
  return [
    head('movie', 'Nog geen video'),
    el('p', { class: 'hint' }, 'Dit project heeft nog geen video. Upload eerst een schermopname of screenshot (links), en maak dan een video.'),
    el('button', { class: 'primary', onclick: () => newVideo() }, icon('add'), 'Nieuwe video'),
    el('div', { class: 'insp-section' }, el('button', { onclick: () => select({ kind: 'brand', i: 0 }, false) }, icon('palette'), 'Merk instellen'))
  ];
}
function openFirst() {
  if (!S.list.length) return showEmpty();
  const last = localStorage.getItem(`ms-last:${S.workspace.path}`);
  openVideo(S.list.some(v => v.id === last) ? last : S.list[S.list.length - 1].id);
}

// ---------- projects & settings ----------
const bridge = window.studio; // present in the Electron app
async function pickFolder(title) {
  if (bridge) return bridge.pickFolder({ title });
  return prompt(`${title}\nVolledig pad naar de map:`);
}
function openProjects() {
  const dlg = $('#dlg-project');
  $('#proj-error').textContent = '';
  $('#proj-create').hidden = true;
  const recents = S.settings.recents || [];
  $('#recent-list').replaceChildren(...(recents.length ? recents.map(p => el('button', {
    class: `recent${p === S.workspace?.path ? ' current' : ''}`,
    onclick: () => switchProject('open', { path: p })
  }, el('b', {}, p.split(/[\\/]/).filter(Boolean).slice(-2).join(' / ')), el('small', {}, p))) : [el('p', { class: 'hint' }, 'Nog geen recente projecten.')]));
  if (!dlg.open) dlg.showModal();
}
async function switchProject(kind, body) {
  try {
    if (S.saveTimer) await flushSave();
    applyState(await api(`/api/workspace/${kind}`, { method: 'POST', body: JSON.stringify(body) }));
    $('#dlg-project').close();
    S.clipDur = {};
    openFirst();
    toast(`Project geopend: ${S.workspace.name}`);
  } catch (e) { $('#proj-error').textContent = e.message; if (!$('#dlg-project').open) openProjects(); }
}
function openSettings() {
  const s = S.settings, d = s.detected || {};
  $('#set-hf').value = s.hyperframes || '';
  $('#set-python').value = s.python || '';
  $('#set-python').placeholder = d.python || 'pad naar python.exe';
  $('#set-piper').value = s.piperVoices || '';
  $('#set-piper').placeholder = d.piperVoices || 'map met .onnx stemmen';
  $('#set-downloads').checked = s.copyToDownloads !== false;
  $('#set-lang').value = s.uiLang || 'auto';
  $('#set-detected').textContent = `Nu gebruikt: Python ${d.python || '—'} · Piper-stemmen ${d.piperVoices || '—'}. Laat leeg voor automatisch.`;
  $('#dlg-settings').showModal();
}
async function saveSettings() {
  const langBefore = S.settings.uiLang || 'auto';
  applyState(await api('/api/settings', { method: 'PUT', body: JSON.stringify({
    hyperframes: $('#set-hf').value.trim() || undefined, python: $('#set-python').value.trim(),
    piperVoices: $('#set-piper').value.trim(), copyToDownloads: $('#set-downloads').checked, uiLang: $('#set-lang').value
  }) }));
  $('#dlg-settings').close();
  // A new interface language comes with the page itself: save the video, then reload.
  if ((S.settings.uiLang || 'auto') !== langBefore) { if (S.saveTimer) await flushSave(); return location.reload(); }
  if (V()) renderInspector();
  toast('Instellingen opgeslagen');
}
function wireDialogs() {
  $('#btn-project').onclick = openProjects;
  $('#proj-close').onclick = () => $('#dlg-project').close();
  $('#proj-open').onclick = async () => { const p = await pickFolder('Kies een projectmap'); if (p) switchProject('open', { path: p }); };
  $('#proj-new').onclick = () => { $('#proj-create').hidden = false; $('#proj-name').focus(); };
  $('#proj-browse').onclick = async () => {
    const p = await pickFolder('Kies of maak een lege map voor het nieuwe project');
    if (p) { $('#proj-path').value = p; if (!$('#proj-name').value) $('#proj-name').value = p.split(/[\\/]/).filter(Boolean).pop(); }
  };
  $('#proj-create-go').onclick = () => {
    const path = $('#proj-path').value.trim();
    if (!path) return ($('#proj-error').textContent = 'Kies eerst een map.');
    switchProject('create', { path, name: $('#proj-name').value.trim() });
  };
  $('#set-cancel').onclick = () => $('#dlg-settings').close();
  $('#set-save').onclick = saveSettings;
  document.querySelectorAll('[data-browse]').forEach(b => (b.onclick = async () => {
    const p = b.dataset.file && bridge ? await bridge.pickFile({ title: 'Kies python.exe', filters: [{ name: 'Python', extensions: ['exe'] }] }) : await pickFolder('Kies een map');
    if (p) $('#' + b.dataset.browse).value = p;
  }));
  if (bridge) {
    document.body.classList.add('electron');
    bridge.onMenu(cmd => ({
      'new-video': () => newVideo(), 'duplicate-video': () => V() && newVideo(S.id), 'projects': openProjects, 'settings': openSettings,
      'render': () => V() && renderMp4(), 'renders': revealRenders, 'batch': openBatch,
      'undo': undo, 'redo': redo, 'play': togglePlay
    })[cmd]?.());
  }
}

// ---------- uploads ----------
async function upload(files) {
  for (const f of files) {
    toast(`Uploaden en omzetten: ${f.name}…`);
    try {
      const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast(`${data.name} toegevoegd`);
    } catch (e) { toast(`Upload mislukt: ${e.message}`, true); }
  }
  await loadState();
}

// ---------- keyboard ----------
function onKey(e) {
  if (e.target.closest?.('input, textarea, select') || document.querySelector('dialog[open]')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); }
  else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
  else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); S.pasteKeep = Date.now(); pasteClip(true); }
  else if (!ctrl && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMarker(); }
  else if (!ctrl && (e.key === '[' || e.key === ']')) { e.preventDefault(); jumpMarker(e.key === ']' ? 1 : -1); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
  else if (!ctrl && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); S.player?.pause(); splitAtPlayhead(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); S.player?.pause(); seek(S.t - (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); S.player?.pause(); seek(S.t + (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'Home') { e.preventDefault(); seek(0); }
  else if (e.key === 'End') { e.preventDefault(); seek(DUR()); }
  else if (e.key === 'Escape') { if (S.tapMode) setTapMode(false); else select(null); }
  else if (!ctrl && !e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); setTapMode(!S.tapMode); }
}

// Copy/cut/paste of timeline items. Text fields keep their normal clipboard.
function wireClipboard() {
  const editing = () => document.activeElement?.closest?.('input, textarea, [contenteditable]') || document.querySelector('dialog[open]');
  document.addEventListener('copy', e => { if (editing() || !V()) return; e.preventDefault(); copySel(false); });
  document.addEventListener('cut', e => { if (editing() || !V()) return; e.preventDefault(); copySel(true); });
  document.addEventListener('paste', e => {
    if (editing() || !V()) return;
    e.preventDefault();
    if (Date.now() - (S.pasteKeep || 0) < 300) return; // Ctrl+Shift+V already pasted at the original time
    pasteClip(false);
  });
}

// ---------- wiring ----------
function init() {
  addEventListener('keydown', onKey);
  addEventListener('resize', fitStage);
  new ResizeObserver(fitStage).observe($('#stage-fit'));
  $('#video-select').addEventListener('change', e => openVideo(e.target.value));
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;
  $('#btn-render').onclick = renderMp4;
  $('#btn-tapmode').onclick = () => setTapMode(!S.tapMode);
  $('#btn-play').onclick = togglePlay;
  $('#btn-start').onclick = () => seek(0);
  $('#btn-prev').onclick = () => { S.player?.pause(); seek(S.t - 1 / FPS); };
  $('#btn-next').onclick = () => { S.player?.pause(); seek(S.t + 1 / FPS); };
  $('#job-close').onclick = () => $('#dlg-job').close();
  $('#safe-toggle').onchange = e => { $('#safe-zone').hidden = !e.target.checked || S.pf !== '9:16'; localStorage.setItem('ms-safe', e.target.checked ? '1' : ''); };
  if (localStorage.getItem('ms-safe')) { $('#safe-toggle').checked = true; $('#safe-zone').hidden = S.pf !== '9:16'; }
  document.querySelectorAll('[data-add]').forEach(b => (b.onclick = () => add(b.dataset.add)));
  $('#upload').onchange = e => { upload([...e.target.files]); e.target.value = ''; };
  S.snapBeats = localStorage.getItem('ms-beats') === '1';
  $('#beats-toggle').checked = S.snapBeats;
  $('#beats-toggle').onchange = e => { S.snapBeats = e.target.checked; try { localStorage.setItem('ms-beats', S.snapBeats ? '1' : ''); } catch {} renderTimeline(); };
  const zoom = $('#tl-zoom');
  zoom.value = S.pps = +(localStorage.getItem('ms-pps') || 70);
  zoom.oninput = () => { S.pps = +zoom.value; localStorage.setItem('ms-pps', zoom.value); renderTimeline(); };
  $('#tl-scroll').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    S.pps = Math.max(20, Math.min(240, S.pps * (e.deltaY < 0 ? 1.12 : 0.89)));
    zoom.value = S.pps; renderTimeline();
  }, { passive: false });
  $('#tl-ruler').addEventListener('pointerdown', e => { S.player?.pause(); seek(xToTime(e)); scrub(e); });
  let dragDepth = 0;
  addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop-overlay').hidden = false; } });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true; if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); });
  addEventListener('beforeunload', e => { if (S.saveTimer) { flushSave(); e.preventDefault(); } });
}

installTranslations();
init();
wireDialogs();
wireClipboard();
buildMenus();
autoDropdowns();
fitStage();
await loadState();
if (!S.workspace) openProjects();
else openFirst();
