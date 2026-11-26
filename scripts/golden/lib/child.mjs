// Runs ONE golden group in its own Node process and writes its files to a
// temporary directory. Process isolation stops library state leaking between
// groups (for example SheetJS keeps a process-wide number-format table, so a
// workbook written by one group could change another group's .xlsx bytes).
//
//   node scripts/golden/lib/child.mjs <group> <outDir> [emailRoot]
process.env.TZ = 'Asia/Singapore';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [name, outDir, emailRoot] = process.argv.slice(2);
const { GROUPS } = await import('./runner.mjs');
const mod = await GROUPS[name].load();
let fixtures;
if (name === 'whatsapp-visual') fixtures = (await import('../groups/whatsapp-data.mjs')).visualFixtures();
const files = await mod.generate({ emailRoot: emailRoot || null, fixtures });
const index = [];
for (const [key, value] of files) {
  const target = join(outDir, key);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
  index.push(key);
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
