// Shared helpers for the Phase 0 golden harness. No network access.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const goldenRoot = resolve(repoRoot, 'docs/merge/golden');

/** Fixed instant used wherever a tool reads the current time: 2026-11-10 09:00 Singapore. */
export const FIXED_NOW = Date.UTC(2026, 10, 10, 1, 0, 0);

/** JSON with sorted object keys so goldens never depend on insertion order. */
export function stableJson(value) {
  const seen = new WeakSet();
  const sort = (v) => {
    if (v === undefined) return null;
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    if (v instanceof Date) return Number.isNaN(+v) ? 'Invalid Date' : v.toISOString();
    if (v instanceof Set) return [...v].map(sort);
    if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), sort(x)]));
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      if (seen.has(v)) throw new Error('Circular value in golden output');
      seen.add(v);
      const out = {};
      for (const key of Object.keys(v).sort()) out[key] = sort(v[key]);
      seen.delete(v);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Runs fn while Date.now()/new Date() return FIXED_NOW; explicit dates are untouched. */
export async function withFixedClock(fn, now = FIXED_NOW) {
  const RealDate = globalThis.Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
  }
  globalThis.Date = FixedDate;
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}

/** Parses --name=value / --flag arguments. */
export function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

/**
 * Locates the email tool. After Phase 1 it lives in this repository; in Phase 0
 * it is read from a worktree pinned to the pre-merge commit.
 */
export function resolveEmailRoot(args) {
  const candidate = args['email-root'] || process.env.GOLDEN_EMAIL_ROOT || resolve(repoRoot, 'prototype/daily-email');
  const root = resolve(candidate);
  if (!existsSync(resolve(root, 'lib/mail.mjs'))) {
    throw new Error(`Email tool not found at ${root}. Pass --email-root=<path to prototype/daily-email>.`);
  }
  return root;
}

/** First differing line between two texts, for readable failure messages. */
export function firstDifference(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (a[i] === undefined || b[i] === undefined) return `line ${i + 1}: expected ${JSON.stringify(a[i] ?? '<missing>')} got ${JSON.stringify(b[i] ?? '<missing>')}`;
      let col = 0;
      while (col < a[i].length && a[i][col] === b[i][col]) col++;
      const around = (s) => JSON.stringify((col > 60 ? '…' : '') + s.slice(Math.max(0, col - 60), col + 80) + (s.length > col + 80 ? '…' : ''));
      return `line ${i + 1}, column ${col + 1}: expected ${around(a[i])} got ${around(b[i])}`;
    }
  }
  return 'contents differ';
}
