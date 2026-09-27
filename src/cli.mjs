// Command line: node src/cli.mjs build <workspace> [id,id…]  → writes <workspace>/projects/<id>[-4x5|-1x1|-16x9]/ for hyperframes render
import { resolve } from 'node:path';
import { Workspace } from './workspace.mjs';

const [cmd, dir, ids] = process.argv.slice(2);
if (cmd !== 'build' || !dir) {
  console.log('Usage: node src/cli.mjs build <workspace> [id,id…]');
  process.exit(1);
}
const ws = new Workspace(resolve(dir));
const only = ids?.split(',');
for (const v of ws.specs().filter(v => !only || only.includes(v.id))) {
  for (const f of ws.formatsOf(v)) console.log('wrote', ws.writeProject(v, f), '→', ws.renderName(v, f));
}
