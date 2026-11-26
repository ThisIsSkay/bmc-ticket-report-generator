// Writes golden outputs. Phase 0 only: later phases must use check.mjs.
// Re-recording is allowed only from the pre-merge commits, to move the goldens
// to a new environment, and must be noted in docs/merge/HANDOFF.md.
//
//   node scripts/golden/record.mjs --email-root=<path to prototype/daily-email>
//   options: --only=survey,email,storage,whatsapp-data,whatsapp-visual  --skip-visual  --out=<dir>
//            --expect-email-commit=<sha prefix>
import { generateGroup, options, writeGroup } from './lib/runner.mjs';

const opts = options(process.argv.slice(2));
for (const name of opts.selected) {
  const started = Date.now();
  const { files } = await generateGroup(name, { emailRoot: opts.emailRoot });
  writeGroup(opts.root, name, files);
  console.log(`recorded ${name}: ${files.size} files (${Date.now() - started} ms)`);
}
