// Packages the launcher into dist/Motion Launcher-win32-x64 (npm run pack:launcher). It is its own small app in
// launcher/, built with the same Electron as Motion Studio.
import { packager } from '@electron/packager';

// --mac: a universal (Intel + Apple Silicon) .app; it has to be built on a Mac (see .github/workflows/mac.yml).
const mac = process.argv.includes('--mac');
// --linux: an x64 build with a lowercase executable; build it on Linux (see .github/workflows/linux.yml).
const linux = process.argv.includes('--linux');
import { readFileSync } from 'node:fs';

const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
const [out] = await packager({
  dir: 'launcher',
  name: 'Motion Launcher',
  platform: mac ? 'darwin' : linux ? 'linux' : 'win32',
  arch: mac ? 'universal' : 'x64',
  out: 'dist',
  overwrite: true,
  electronVersion,
  icon: mac ? 'launcher/icons/launcher.icns' : linux ? 'launcher/icons/launcher.png' : 'launcher/icons/launcher.ico',
  ...(linux && { executableName: 'motion-launcher' }),
  asar: false,
  prune: false
});
console.log(`Wrote ${out}`);
