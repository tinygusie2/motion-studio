// Packages the Windows app into dist/Motion Studio-win32-x64 (npm run pack).
// The options live here instead of on the command line: npm runs scripts through cmd.exe on Windows, which eats the
// `^` of `--ignore=^/dist`, and an unanchored /dist also threw away node_modules/gsap/dist.
import { packager } from '@electron/packager';

const [out] = await packager({
  dir: '.',
  name: 'Motion Studio',
  platform: 'win32',
  arch: 'x64',
  out: 'dist',
  overwrite: true,
  icon: 'resources/icon.ico',
  asar: false,
  // Paths are relative to the project, starting with /.
  ignore: [/^\/dist(\/|$)/, /^\/scripts(\/|$)/, /^\/docs(\/|$)/, /^\/test(\/|$)/, /^\/\.git/, /^\/\.claude(\/|$)/]
});
console.log(`Wrote ${out}`);
