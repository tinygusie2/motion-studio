// Renders resources/icon.svg (or the launcher's icon) to icon.png (256 px) and icon.ico (16–256 px, PNG entries) with Electron itself:
//   electron scripts/make-icon.cjs [--launcher]   (the launcher's icon is launcher/icons/launcher.svg)
// The SVG is drawn on a <canvas> inside a hidden window, which needs no screen capture.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, '..', process.argv.includes('--launcher') ? 'launcher/icons' : 'resources');
const base = process.argv.includes('--launcher') ? 'launcher' : 'icon';
const svg = readFileSync(join(dir, base + '.svg'), 'utf8');
const sizes = [256, 64, 48, 32, 24, 16];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html></html>');
  const dataUrls = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await img.decode();
    return ${JSON.stringify(sizes)}.map(size => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png');
    });
  })()`);
  const pngs = dataUrls.map(u => Buffer.from(u.split(',')[1], 'base64'));
  writeFileSync(join(dir, base + '.png'), pngs[0]);
  // ICO: header, one directory entry per size, then the PNG data.
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  writeFileSync(join(dir, base + '.ico'), Buffer.concat([header, ...entries, ...pngs]));
  console.log(`Wrote ${join(dir, base)}.png and .ico`);
  app.exit(0);
});
