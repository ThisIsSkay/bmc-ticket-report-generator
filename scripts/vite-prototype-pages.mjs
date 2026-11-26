// Dev server and `vite preview`: serves the email and survey pages at the same paths they are
// published at (/daily-email/, /customer-survey/), so the unified app's frames
// work under `npm run dev`. Without this, Vite's SPA fallback answers those
// paths with the WhatsApp page. Production uses scripts/stage-pages.mjs instead.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const PAGES = { '/daily-email/': 'prototype/daily-email', '/customer-survey/': 'prototype/customer-survey' };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function middleware(server) {
  return (req, res, next) => {
    const base = server.config.base || '/';
    let url;
    try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { return next(); }
    if (!url.startsWith(base)) return next();
    url = '/' + url.slice(base.length);
    // Bare folder paths (no trailing slash) would hit the SPA fallback; redirect like GitHub Pages does.
    const bare = ['/app', ...Object.keys(PAGES).map((prefix) => prefix.slice(0, -1))].find((path) => url === path);
    if (bare) { res.statusCode = 301; res.setHeader('Location', base + bare.slice(1) + '/'); res.end(); return; }
    const prefix = Object.keys(PAGES).find((p) => url.startsWith(p));
    if (!prefix) return next();
    const root = resolve(server.config.root, PAGES[prefix]);
    let file = resolve(root, '.' + url.slice(prefix.length - 1));
    if (url.endsWith('/')) file = resolve(file, 'index.html');
    if (file !== root && !file.startsWith(root + sep)) { res.statusCode = 403; res.end('Forbidden'); return; }
    if (!existsSync(file) || statSync(file).isDirectory() || /[\\/](test|node_modules)[\\/]/.test(file.slice(root.length))) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(res);
  };
}

export function prototypePages() {
  return {
    name: 'bmc-prototype-pages',
    configureServer(server) { server.middlewares.use(middleware(server)); },
    // `vite preview` too, so a preview works even before `npm run stage:pages`.
    configurePreviewServer(server) { server.middlewares.use(middleware(server)); },
  };
}
