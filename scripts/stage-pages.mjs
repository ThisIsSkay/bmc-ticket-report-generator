// Copies the two browser prototypes into dist/ next to the Vite build, so one
// checkout publishes every page (no other branch is fetched at build time).
// Run after `npm run build:gh-pages`. Used by CI and for local previews.
//
//   dist/                    WhatsApp report (Vite)       — unchanged live page
//   dist/app/                unified app shell (Vite)     — built by Vite
//   dist/daily-email/        email reports prototype      — copied here
//   dist/customer-survey/    customer survey preview      — copied here
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, process.argv[2] || 'dist');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error(`${dist} has no index.html. Run npm run build:gh-pages first.`);

// Only files the browser needs: no tests, docs, servers or package files.
const PAGES = {
  'daily-email': ['index.html', 'app.mjs', 'style.css', 'lib', 'vendor', 'samples/fictional-tickets.csv'],
  'customer-survey': ['index.html', 'app.mjs', 'style.css', 'lib', 'vendor'],
};

for (const [page, entries] of Object.entries(PAGES)) {
  const from = resolve(root, 'prototype', page);
  const to = resolve(dist, page);
  rmSync(to, { recursive: true, force: true });
  for (const entry of entries) {
    const source = resolve(from, entry);
    if (!existsSync(source)) throw new Error(`Missing ${page}/${entry}`);
    const target = resolve(to, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  console.log(`staged ${page}: ${entries.join(', ')}`);
}
