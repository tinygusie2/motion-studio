// Packages the launcher into dist/Motion Launcher-win32-x64 (npm run pack:launcher). It is its own small app in
// launcher/, built with the same Electron as Motion Studio.
import { packager } from '@electron/packager';
import { readFileSync } from 'node:fs';

const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
const [out] = await packager({
  dir: 'launcher',
  name: 'Motion Launcher',
  platform: 'win32',
  arch: 'x64',
  out: 'dist',
  overwrite: true,
  electronVersion,
  icon: 'launcher/icons/launcher.ico',
  asar: false,
  prune: false
});
console.log(`Wrote ${out}`);
