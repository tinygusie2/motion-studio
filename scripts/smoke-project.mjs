// A project with one video, for the packaged app's --smoke-test on a fresh machine (CI): node scripts/smoke-project.mjs <dir>
// Run it with HOME pointing at a scratch folder: the app's settings (~/.motion-studio) then open this project.
import { createWorkspace, Workspace, loadSettings, saveSettings } from '../src/workspace.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/smoke-project.mjs <dir>');
createWorkspace(dir, 'Smoke test');
new Workspace(dir).writeSpec('smoke', {
  brand: 'brand', layout: 'text', dur: 4, end: 3,
  heads: [{ t: 0.3, text: 'Smoke *test*' }],
  clips: [], chips: [], zooms: [], taps: [], subs: [], vo: { lines: [] }
});
saveSettings({ ...loadSettings(), workspace: dir, recents: [dir] });
console.log(`Smoke project in ${dir}`);
