// UI widgets: styled dropdowns on top of native <select>s, and a Windows-style menu bar.
// Both render their lists as popovers (top layer), so they escape scrolling panels and show above open dialogs.

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
};
const icon = name => h('span', { class: 'ms' }, name);

// A popover list anchored under (or above) an element. Returns { el, close }.
function popover(anchor, cls, build, { onClose, align = 'left', minWidth } = {}) {
  const host = anchor.closest('dialog[open]') || document.body;
  const el = h('div', { class: `pop ${cls}`, popover: 'manual', role: 'listbox' });
  build(el);
  host.append(el);
  el.showPopover();
  const place = () => {
    const r = anchor.getBoundingClientRect();
    el.style.minWidth = `${Math.round(minWidth ?? r.width)}px`;
    const room = innerHeight - r.bottom - 8, above = r.top - 8;
    el.style.maxHeight = `${Math.max(160, Math.min(420, room > 260 || room > above ? room : above))}px`;
    const eh = el.offsetHeight, ew = el.offsetWidth;
    const top = room >= eh || room > above ? r.bottom + 4 : r.top - 4 - eh;
    const left = align === 'right' ? r.right - ew : r.left;
    el.style.left = `${Math.max(6, Math.min(left, innerWidth - ew - 6))}px`;
    el.style.top = `${Math.max(6, top)}px`;
  };
  place();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    removeEventListener('resize', close); removeEventListener('blur', close);
    document.removeEventListener('scroll', scrolled, true);
    try { el.hidePopover(); } catch {}
    el.remove();
    onClose?.();
  };
  const outside = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const scrolled = e => { if (!el.contains(e.target)) close(); };
  document.addEventListener('pointerdown', outside, true);
  addEventListener('resize', close); addEventListener('blur', close);
  document.addEventListener('scroll', scrolled, true);
  return { el, close, place };
}

// Keyboard movement over the enabled rows of a list.
function listKeys(el, rowSel, e, onPick) {
  const rows = [...el.querySelectorAll(rowSel)].filter(r => !r.hidden && !r.classList.contains('disabled'));
  if (!rows.length) return false;
  let i = rows.findIndex(r => r.classList.contains('active'));
  const go = n => { rows.forEach(r => r.classList.remove('active')); const r = rows[(n + rows.length) % rows.length]; r.classList.add('active'); r.scrollIntoView({ block: 'nearest' }); };
  if (e.key === 'ArrowDown') { go(i + 1); return true; }
  if (e.key === 'ArrowUp') { go(i < 0 ? rows.length - 1 : i - 1); return true; }
  if (e.key === 'Home') { go(0); return true; }
  if (e.key === 'End') { go(rows.length - 1); return true; }
  if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { onPick(rows[i]); return true; }
  return false;
}

// ---------- dropdowns ----------
// The native <select> stays in the DOM (hidden) as the source of truth: existing code keeps reading .value and
// listening for 'change'. `extras[select.id]` can add per-option hints and actions and footer entries.
export const dropdownExtras = {};

export function enhanceSelect(sel) {
  if (sel.dataset.dd) return;
  sel.dataset.dd = '1';
  const label = h('span', { class: 'dd-label' });
  const btn = h('button', { type: 'button', class: `dd ${sel.className}`, 'aria-haspopup': 'listbox', ...(sel.id && { 'data-for': sel.id }), ...(sel.title && { title: sel.title }) }, label, icon('expand_more'));
  if (sel.style.cssText) btn.style.cssText = sel.style.cssText;
  sel.after(btn);
  sel.hidden = true;
  let open = null;
  btn.update = () => {
    const o = sel.selectedOptions[0];
    label.textContent = o ? o.textContent : '';
    label.classList.toggle('no-i18n', !!o?.classList.contains('no-i18n')); // e.g. language names stay in their own language
    label.classList.toggle('placeholder', !o || o.value === '');
    btn.disabled = sel.disabled;
  };
  const pick = value => {
    open?.close();
    if (sel.value !== value) { sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    btn.update();
    btn.focus();
  };
  const show = () => {
    if (open) return open.close();
    const ex = dropdownExtras[sel.id] || {};
    const opts = [...sel.options];
    const search = opts.length > 9 ? h('input', { class: 'dd-search', placeholder: 'Zoeken…' }) : null;
    open = popover(btn, 'dd-menu', el => {
      if (search) el.append(search);
      el.append(...opts.map(o => {
        const acts = (ex.actions?.(o.value) || []).map(a => h('button', { type: 'button', class: `dd-act${a.danger ? ' danger' : ''}`, title: a.title, onclick: e => { e.stopPropagation(); open?.close(); a.run(); } }, icon(a.icon)));
        const hint = ex.hint?.(o.value) ?? o.dataset.hint;
        return h('div', { class: `dd-opt${o.value === sel.value ? ' on' : ''}${o.disabled ? ' disabled' : ''} ${o.className}`.trim(), role: 'option', 'data-value': o.value, onclick: () => !o.disabled && pick(o.value) },
          icon(o.value === sel.value ? 'check' : ''), h('span', { class: 'dd-text' }, h('span', {}, o.textContent), hint ? h('small', {}, hint) : null), ...acts);
      }));
      for (const f of ex.footer?.() || []) el.append(h('div', { class: 'dd-opt dd-foot', role: 'option', onclick: () => { open?.close(); f.run(); } }, icon(f.icon), h('span', { class: 'dd-text' }, f.label)));
    }, { onClose: () => { open = null; btn.classList.remove('open'); } });
    btn.classList.add('open');
    const cur = open.el.querySelector('.dd-opt.on');
    if (cur) { cur.classList.add('active'); cur.scrollIntoView({ block: 'nearest' }); }
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        open.el.querySelectorAll('.dd-opt:not(.dd-foot)').forEach(r => (r.hidden = !r.textContent.toLowerCase().includes(q)));
      });
      search.focus();
    } else open.el.tabIndex = -1, open.el.focus();
    open.el.addEventListener('keydown', e => {
      e.stopPropagation(); // keys in the list never reach the editor's shortcuts
      if (e.key === 'Escape') { e.preventDefault(); open.close(); btn.focus(); return; }
      if (e.key === 'Tab') return open.close();
      if (e.key === ' ' && e.target === search) return;
      if (listKeys(open.el, '.dd-opt', e, r => (r.classList.contains('dd-foot') ? r.click() : pick(r.dataset.value)))) e.preventDefault();
    });
  };
  btn.addEventListener('click', show);
  btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); if (!open) show(); } });
  btn.update();
}

// Enhances every new <select> and keeps every dropdown's label in step with its select (options and values are
// often replaced in code, without a change event).
export function autoDropdowns(root = document.body) {
  let queued = false;
  const sync = () => {
    queued = false;
    root.querySelectorAll('select:not([data-dd])').forEach(enhanceSelect);
    root.querySelectorAll('.dd').forEach(b => b.update?.());
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(sync); } }).observe(root, { childList: true, subtree: true });
  sync();
  return sync;
}

// ---------- menu bar ----------
// menus: [{ label, items: () => [{ label, key, run, disabled, checked, sep, header }] }]; items are built when a
// menu opens, so labels, ticks and disabled states are always current.
export function menubar(nav, menus) {
  let current = null; // { i, pop }
  const buttons = menus.map((m, i) => h('button', { type: 'button', class: 'mb-item', onclick: () => (current?.i === i ? closeAll() : openMenu(i)), onpointerenter: () => { if (current && current.i !== i) openMenu(i); } }, m.label));
  nav.replaceChildren(...buttons);
  nav.setAttribute('role', 'menubar');
  const closeAll = () => { const c = current; current = null; c?.pop.close(); };
  function openMenu(i, focusFirst) {
    if (current) { const c = current; current = null; c.pop.close(); }
    const btn = buttons[i];
    const pop = popover(btn, 'mb-menu', el => {
      el.setAttribute('role', 'menu');
      for (const it of menus[i].items().filter(Boolean)) {
        if (it.sep) { el.append(h('div', { class: 'mb-sep' })); continue; }
        if (it.header) { el.append(h('div', { class: 'mb-head' }, it.header)); continue; }
        el.append(h('div', {
          class: `mb-row${it.disabled ? ' disabled' : ''}`, role: 'menuitem',
          onclick: () => { if (it.disabled) return; closeAll(); setTimeout(it.run); }
        }, icon(it.checked ? 'check' : it.icon || ''), h('span', { class: 'mb-label' }, it.label), h('span', { class: 'mb-key' }, it.key || '')));
      }
    }, { minWidth: 240, onClose: () => { btn.classList.remove('open'); if (current?.pop === pop) current = null; } });
    btn.classList.add('open');
    current = { i, pop };
    pop.el.tabIndex = -1;
    pop.el.focus();
    if (focusFirst) listKeys(pop.el, '.mb-row', { key: 'ArrowDown' }, () => {});
    pop.el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeAll(); btn.focus(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); openMenu((i + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length, true); }
      else if (listKeys(pop.el, '.mb-row', e, r => r.click())) e.preventDefault();
      e.stopPropagation();
    });
  }
  // Alt on its own opens the first menu, like a Windows menu bar; F10 too.
  let altAlone = false;
  addEventListener('keydown', e => { altAlone = e.key === 'Alt' && !e.repeat ? true : false; if (e.key === 'F10') { e.preventDefault(); current ? closeAll() : openMenu(0, true); } });
  // Alt held while dragging (no snapping on the timeline) is not a menu press.
  addEventListener('pointermove', e => { if (e.buttons) altAlone = false; });
  addEventListener('keyup', e => { if (e.key === 'Alt' && altAlone) { e.preventDefault(); current ? closeAll() : openMenu(0, true); } altAlone = false; });
  return { close: closeAll };
}
