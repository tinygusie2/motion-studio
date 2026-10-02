// Motion Launcher: installs the editors listed in apps.json from their GitHub releases, keeps them up to date and
// starts them. Extra editors can be added without a new launcher build in %APPDATA%\Motion Launcher\apps.json.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, cleanup, compareVersions, findExisting, install, installedExe, latestRelease, launch } from './updater.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const smoke = process.argv.includes('--smoke-test');
if (!smoke && !app.requestSingleInstanceLock()) app.quit();

const CHECK_EVERY = 60 * 60 * 1000;
// Programs are big and not roaming data: they go in Local, the settings file next to them.
const root = process.env.MOTION_LAUNCHER_HOME || join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Motion Launcher');
const store = new Store(root);
const lang = () => (app.getLocale() || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en';
const loc = v => v && typeof v === 'object' ? v[lang()] ?? v.en ?? Object.values(v)[0] : v;

function loadApps() {
  const read = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; } };
  const list = [...read(join(here, 'apps.json'))];
  // The user's own entries replace a built-in one with the same id (e.g. Visual Studio with a repo filled in), fill a
  // free slot, or come after the rest.
  for (const extra of read(join(root, 'apps.json'))) {
    let at = list.findIndex(a => a.id === extra.id);
    if (at < 0) at = list.findIndex(a => a.placeholder && !a.comingSoon);
    if (at >= 0) list[at] = extra; else list.push(extra);
  }
  return list.map(a => ({ ...a, name: loc(a.name), description: loc(a.description) }));
}
// Start menu shortcuts, so Windows Search finds the launcher and every app it installed. An app's shortcut points at its
// installed version, so it is written again after each update.
const startMenu = () => join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
function shortcut(name, target, description = '') {
  if (process.platform !== 'win32' || smoke || !existsSync(target)) return;
  const file = join(startMenu(), `${name.replace(/[\\/:*?"<>|]/g, '')}.lnk`);
  try { shell.writeShortcutLink(file, existsSync(file) ? 'replace' : 'create', { target, cwd: dirname(target), icon: target, iconIndex: 0, description }); } catch {}
}
function appShortcut(a) {
  const info = store.installed(a.id);
  if (info) shortcut(a.name, installedExe(root, a, info), a.description);
}
// The exes behind the Start menu and desktop shortcuts, for finding editors that were installed without the launcher.
function shortcutTargets() {
  if (process.platform !== 'win32') return [];
  const dirs = [startMenu(), join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), app.getPath('desktop')];
  const out = [];
  const walk = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      if (d.isDirectory() && depth < 2) walk(join(dir, d.name), depth + 1);
      else if (d.name.toLowerCase().endsWith('.lnk')) { try { out.push(shell.readShortcutLink(join(dir, d.name)).target); } catch {} }
    }
  };
  for (const d of dirs) walk(d, 0);
  return out;
}
// Adopts copies that are already on this PC, and forgets a found copy that is gone.
function adoptExisting() {
  let targets = null;
  for (const a of apps) {
    const info = store.installed(a.id);
    if (info?.path && !existsSync(installedExe(root, a, info))) { delete store.state.apps[a.id]; store.save(); }
    if (store.installed(a.id)) continue;
    const found = findExisting(a, targets ??= shortcutTargets());
    if (found) store.setInstalled(a.id, found);
  }
}
let apps = []; // loaded once Electron is ready: the locale that picks the texts is only known then
const releases = {};   // id → latest release, or { error }
const jobs = {};       // id → { phase, received, total } while installing
let win, checking = null;

function view() {
  return {
    lang: lang(), root, version: app.getVersion(), settings: store.settings,
    apps: apps.map(a => {
      const installed = store.installed(a.id);
      const latest = releases[a.id] || null;
      const update = !!(latest?.version && latest.zip && (!installed || compareVersions(latest.version, installed.version) > 0));
      return {
        id: a.id, name: a.name, description: a.description, placeholder: !!a.placeholder || !a.repo, comingSoon: !!a.comingSoon, repo: a.repo || null,
        icon: a.icon && existsSync(join(here, a.icon)) ? a.icon : null,
        installed, latest, update, job: jobs[a.id] || null
      };
    })
  };
}
const push = () => win?.webContents.send('state', view());

async function checkAll() {
  if (checking) return checking;
  checking = (async () => {
    await Promise.all(apps.filter(a => a.repo).map(async a => {
      try { releases[a.id] = await latestRelease(a); } catch (err) { releases[a.id] = { error: String(err.message || err) }; }
    }));
    push();
    // Only apps that are already installed update by themselves; a first install is the user's choice.
    if (store.settings.autoUpdate) autoUpdate();
  })().finally(() => { checking = null; });
  return checking;
}

async function autoUpdate() {
  for (const a of apps) {
    const installed = store.installed(a.id), latest = releases[a.id];
    if (installed && latest?.zip && compareVersions(latest.version, installed.version) > 0) await update(a.id).catch(() => {});
  }
}

async function update(id) {
  const a = apps.find(x => x.id === id);
  if (!a?.repo) throw new Error('Unknown app');
  if (jobs[id]) return;
  try {
    if (!releases[id]?.zip) releases[id] = await latestRelease(a);
    jobs[id] = { phase: 'download', received: 0, total: releases[id]?.zip?.size || 0 };
    push();
    await install(a, releases[id], { root, store, onProgress: p => { jobs[id] = { ...jobs[id], ...p }; push(); } });
    appShortcut(a);
    delete jobs[id];
  } catch (err) {
    jobs[id] = { phase: 'error', error: String(err.message || err) };
    push();
    throw err;
  }
  push();
}

ipcMain.handle('state', () => view());
ipcMain.handle('check', async () => { await checkAll(); return view(); });
ipcMain.handle('install', (_e, id) => update(id).then(() => null, err => String(err.message || err)));
ipcMain.handle('launch', (_e, id) => {
  try {
    launch(apps.find(a => a.id === id), { root, store });
    if (store.settings.closeOnLaunch) setTimeout(() => app.quit(), 800);
    return null;
  } catch (err) { return String(err.message || err); }
});
ipcMain.handle('settings', (_e, patch) => { store.setSettings(patch); push(); return view(); });
ipcMain.handle('open', (_e, what, id) => {
  if (what === 'folder') {
    const a = apps.find(x => x.id === id), info = a && store.installed(a.id);
    return shell.openPath(info?.path || (id ? join(root, 'apps', id) : root));
  }
  if (what === 'release' && releases[id]?.url) return shell.openExternal(releases[id].url);
  if (what === 'repo') { const a = apps.find(x => x.id === id); if (a?.repo) return shell.openExternal(`https://github.com/${a.repo}`); }
  if (what === 'apps-file') {
    const file = join(root, 'apps.json');
    if (!existsSync(file)) writeFileSync(file, JSON.stringify([{ id: 'my-editor', name: 'My editor', description: '', repo: 'owner/repo', asset: '^My-Editor-.*-win-x64\\.zip$', checksums: 'SHA256SUMS.txt', exe: 'My Editor.exe' }], null, 2));
    return shell.openPath(file);
  }
});

async function createWindow() {
  apps = loadApps();
  if (!smoke) adoptExisting();
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 980, height: 660, minWidth: 760, minHeight: 520,
    show: false, backgroundColor: '#0b0d11', title: 'Motion Launcher',
    icon: join(here, 'icons', 'launcher.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0d11', symbolColor: '#eef0f6', height: 44 },
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadFile(join(here, 'index.html'));

  if (smoke) {
    const result = await win.webContents.executeJavaScript(`new Promise(done => {
      let n = 0; const tick = () => {
        const cards = document.querySelectorAll('.card').length;
        if (cards || ++n > 50) done({ title: document.title, cards, lang: document.documentElement.lang }); else setTimeout(tick, 100);
      }; tick();
    })`);
    console.log('SMOKE', JSON.stringify(result));
    const shot = process.argv[process.argv.indexOf('--smoke-test') + 1];
    if (shot && !shot.startsWith('--')) {
      await new Promise(r => setTimeout(r, 1500));
      writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
    }
    app.exit(result.cards ? 0 : 1);
    return;
  }

  // The page asks for the first check as soon as it shows; after that, once an hour while the launcher is open.
  for (const a of apps) { cleanup(a, { root, store }); appShortcut(a); }
  if (app.isPackaged) shortcut('Motion Launcher', process.execPath, 'Installs, updates and starts Motion Studio and Visual');
  setInterval(checkAll, CHECK_EVERY);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(createWindow).catch(err => { dialog.showErrorBox('Motion Launcher', String(err.stack || err)); app.exit(1); });
