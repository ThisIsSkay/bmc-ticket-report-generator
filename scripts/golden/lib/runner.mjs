// Shared runner for record.mjs and check.mjs.
process.env.TZ = 'Asia/Singapore'; // every group computes local dates in Singapore time

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { firstDifference, goldenRoot, parseArgs, resolveEmailRoot } from './util.mjs';

const BINARY = /\.(png|jpe?g)$/i;

export const GROUPS = {
  survey: { prefix: 'survey/', load: () => import('../groups/survey.mjs') },
  email: { prefix: 'email/', load: () => import('../groups/email.mjs') },
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
  const needsEmail = selected.includes('email');
  return { args, selected, root: resolve(args.out || goldenRoot), emailRoot: needsEmail ? resolveEmailRoot(args) : null };
}

export async function generateGroup(name, ctx) {
  const mod = await GROUPS[name].load();
  let fixtures;
  if (name === 'whatsapp-visual') fixtures = (await import('../groups/whatsapp-data.mjs')).visualFixtures();
  const files = await mod.generate({ ...ctx, fixtures });
  for (const key of files.keys()) if (!key.startsWith(GROUPS[name].prefix)) throw new Error(`${name} produced ${key} outside ${GROUPS[name].prefix}`);
  return { files, compare: mod.compare };
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
