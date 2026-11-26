// Regenerates every golden output and compares it with docs/merge/golden/.
// Exits 1 on any NEW, CHANGED or MISSING file.
//
//   node scripts/golden/check.mjs --email-root=<path to prototype/daily-email>
//   options: --only=survey,email,whatsapp-data,whatsapp-visual  --skip-visual
import { checkGroup, generateGroup, options } from './lib/runner.mjs';

const opts = options(process.argv.slice(2));
let failures = 0;
for (const name of opts.selected) {
  const started = Date.now();
  const { files, compare } = await generateGroup(name, { emailRoot: opts.emailRoot });
  const problems = await checkGroup(opts.root, name, files, compare);
  failures += problems.length;
  console.log(`${problems.length ? 'FAIL' : 'PASS'} ${name}: ${files.size} files checked (${Date.now() - started} ms)`);
  for (const line of problems.slice(0, 25)) console.log('  ' + line);
  if (problems.length > 25) console.log(`  … and ${problems.length - 25} more`);
}
if (opts.selected.length < 4) console.log(`Note: only ${opts.selected.join(', ')} checked.`);
process.exitCode = failures ? 1 : 0;
