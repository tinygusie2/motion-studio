// Packages the Windows app into dist/Motion Studio-win32-x64 (npm run pack).
// The options live here instead of on the command line: npm runs scripts through cmd.exe on Windows, which eats the
// `^` of `--ignore=^/dist`, and an unanchored /dist also threw away node_modules/gsap/dist.
import { packager } from '@electron/packager';

// --mac: a universal (Intel + Apple Silicon) .app; it has to be built on a Mac (see .github/workflows/mac.yml).
const mac = process.argv.includes('--mac');

const [out] = await packager({
  dir: '.',
  name: 'Motion Studio',
  platform: mac ? 'darwin' : 'win32',
  arch: mac ? 'universal' : 'x64',
  out: 'dist',
  overwrite: true,
  icon: mac ? 'resources/icon.icns' : 'resources/icon.ico',
  asar: false,
  // Paths are relative to the project, starting with /.
  ignore: [/^\/dist(\/|$)/, /^\/launcher(\/|$)/, /^\/scripts(\/|$)/, /^\/docs(\/|$)/, /^\/test(\/|$)/, /^\/\.git/, /^\/\.claude(\/|$)/]
});
console.log(`Wrote ${out}`);
