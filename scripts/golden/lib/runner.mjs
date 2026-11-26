// Shared runner for record.mjs and check.mjs.
process.env.TZ = 'Asia/Singapore'; // every group computes local dates in Singapore time

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstDifference, goldenRoot, parseArgs, resolveEmailRoot } from './util.mjs';

const BINARY = /\.(png|jpe?g)$/i;

export const GROUPS = {
  survey: { prefix: 'survey/', load: () => import('../groups/survey.mjs') },
  email: { prefix: 'email/', load: () => import('../groups/email.mjs') },
  storage: { prefix: 'storage/', load: () => import('../groups/storage.mjs') },
  'whatsapp-data': { prefix: 'whatsapp/data/', load: () => import('../groups/whatsapp-data.mjs') },
  'whatsapp-visual': { prefix: 'whatsapp/visual/', load: () => import('../groups/whatsapp-visual.mjs'), browser: true },
};

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

export function options(argv) {
  const args = parseArgs(argv);
  const only = args.only ? String(args.only).split(',') : Object.keys(GROUPS);
  for (const name of only) if (!GROUPS[name]) throw new Error(`Unknown group "${name}". Known: ${Object.keys(GROUPS).join(', ')}`);
  const selected = only.filter((name) => !(args['skip-visual'] && GROUPS[name].browser));
  const needsEmail = selected.includes('email') || selected.includes('storage');
  return { args, selected, root: resolve(args.out || goldenRoot), emailRoot: needsEmail ? resolveEmailRoot(args) : null };
}

/** Generates one group in a separate Node process (see child.mjs) and returns its files. */
export async function generateGroup(name, ctx) {
  const tmp = mkdtempSync(join(tmpdir(), `golden-${name}-`));
  try {
    const child = fileURLToPath(new URL('./child.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [child, name, tmp, ctx.emailRoot || ''], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, TZ: 'Asia/Singapore' } });
    if (result.status !== 0) throw new Error(`golden group ${name} failed to generate (exit ${result.status})`);
    const index = JSON.parse(readFileSync(join(tmp, 'index.json'), 'utf8'));
    const files = new Map(index.map((key) => [key, BINARY.test(key) ? readFileSync(join(tmp, key)) : readFileSync(join(tmp, key), 'utf8')]));
    for (const key of files.keys()) if (!key.startsWith(GROUPS[name].prefix)) throw new Error(`${name} produced ${key} outside ${GROUPS[name].prefix}`);
    const mod = await GROUPS[name].load();
    return { files, compare: mod.compare };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function writeGroup(root, name, files) {
  rmSync(join(root, GROUPS[name].prefix), { recursive: true, force: true });
  for (const [key, value] of files) {
    const target = join(root, key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  }
}

export async function checkGroup(root, name, files, compare) {
  const problems = [];
  const expected = new Set(listFiles(join(root, GROUPS[name].prefix)).map((f) => relative(root, f).split('\\').join('/')));
  for (const [key, value] of files) {
    if (!expected.has(key)) { problems.push(`NEW      ${key} (not in goldens)`); continue; }
    expected.delete(key);
    const golden = readFileSync(join(root, key));
    if (BINARY.test(key)) {
      const actual = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const message = compare ? await compare(key, golden, actual) : (golden.equals(actual) ? null : 'bytes differ');
      if (message) problems.push(`CHANGED  ${key}: ${message}`);
    } else {
      const text = golden.toString('utf8');
      const actual = Buffer.isBuffer(value) ? value.toString('utf8') : value;
      if (text !== actual) problems.push(`CHANGED  ${key}: ${firstDifference(text, actual)}`);
    }
  }
  for (const key of expected) problems.push(`MISSING  ${key} (golden exists, not produced)`);
  return problems;
}
