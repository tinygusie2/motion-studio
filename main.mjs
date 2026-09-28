// Electron shell: runs the editor backend in-process on a localhost port and shows it in a window.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './src/server.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const smoke = process.argv.includes('--smoke-test');
if (!smoke && !app.requestSingleInstanceLock()) app.quit();

let win;
const send = cmd => win?.webContents.send('menu', cmd);

function buildMenu() {
  const acc = (label, accelerator, cmd) => ({ label, accelerator, click: () => send(cmd) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Bestand', submenu: [
      acc('Nieuwe video…', 'CmdOrCtrl+N', 'new-video'),
      acc('Video dupliceren…', 'CmdOrCtrl+Shift+D', 'duplicate-video'),
      { type: 'separator' },
      acc('Projecten…', 'CmdOrCtrl+O', 'projects'),
      acc('Rendermap openen', 'CmdOrCtrl+Shift+R', 'renders'),
      { type: 'separator' },
      acc('Instellingen…', 'CmdOrCtrl+,', 'settings'),
      { type: 'separator' },
      { role: 'quit', label: 'Afsluiten' }
    ] },
    { label: 'Bewerken', submenu: [
      { role: 'cut', label: 'Knippen' }, { role: 'copy', label: 'Kopiëren' }, { role: 'paste', label: 'Plakken' }
    ] },
    { label: 'Video', submenu: [acc('Render MP4', 'CmdOrCtrl+R', 'render'), acc('Batch renderen…', 'CmdOrCtrl+Shift+B', 'batch')] },
    { label: 'Beeld', submenu: [
      { role: 'reload', label: 'Herladen', accelerator: 'F5' }, { role: 'toggleDevTools', label: 'Ontwikkelaarstools' },
      { type: 'separator' }, { role: 'resetZoom', label: 'Werkelijke grootte' }, { role: 'zoomIn', label: 'Inzoomen' }, { role: 'zoomOut', label: 'Uitzoomen' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Volledig scherm' }
    ] }
  ]));
}

async function createWindow() {
  // A fixed port keeps the page's origin, and with it localStorage (preview format, timeline zoom, clipboard, last
  // video), the same between launches. Taken by something else: a few neighbours, then any free port.
  const { url } = await startServer({ port: [34170, 34171, 34172, 0] });
  win = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1100, minHeight: 700,
    show: false, backgroundColor: '#0b0d11', title: 'Motion Studio',
    icon: join(here, 'resources', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#12151b', symbolColor: '#eef0f6', height: 54 },
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Closing: let the editor write its last change first (it saves 350 ms after an edit), then close for real.
  let flushed = false;
  win.on('close', e => {
    if (flushed || smoke) return;
    e.preventDefault(); flushed = true;
    const flush = win.webContents.executeJavaScript('window.__flushSave?.()', true).catch(() => {});
    Promise.race([flush, new Promise(r => setTimeout(r, 3000))]).finally(() => win.destroy());
  });
  // Links (e.g. to fonts.google.com) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => { shell.openExternal(target); return { action: 'deny' }; });
  await win.loadURL(url);

  if (smoke) {
    // CI-style self check: the editor loads, a video opens and its preview player comes up.
    const result = await win.webContents.executeJavaScript(`new Promise(done => {
      let n = 0; const tick = () => {
        const f = document.querySelector('.pv.front'); const p = f && f.contentWindow && f.contentWindow.__player;
        if (p || ++n > 100) done({ title: document.title, project: document.querySelector('#project-name').textContent, player: !!p, duration: p && p.duration, electron: document.body.classList.contains('electron'), url: location.origin, lang: document.documentElement.lang });
        else setTimeout(tick, 100);
      }; tick();
    })`);
    console.log('SMOKE', JSON.stringify(result));
    const shot = process.argv[process.argv.indexOf('--smoke-test') + 1];
    if (shot && !shot.startsWith('--')) {
      await new Promise(r => setTimeout(r, 1500));
      writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
    }
    app.exit(result.player ? 0 : 1);
  }
}

ipcMain.handle('pick-folder', async (_e, opts = {}) => (await dialog.showOpenDialog(win, { title: opts.title, properties: ['openDirectory', 'createDirectory'] })).filePaths[0] || null);
// The in-app menu bar (the native one is hidden with the title bar) asks for these window actions.
ipcMain.handle('window', (_e, action) => {
  if (action === 'fullscreen') win?.setFullScreen(!win.isFullScreen());
  if (action === 'devtools') win?.webContents.toggleDevTools();
});
ipcMain.handle('pick-file', async (_e, opts = {}) => (await dialog.showOpenDialog(win, { title: opts.title, filters: opts.filters, properties: ['openFile'] })).filePaths[0] || null);

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => { buildMenu(); return createWindow(); }).catch(err => { dialog.showErrorBox('Motion Studio kon niet starten', String(err.stack || err)); app.exit(1); });
