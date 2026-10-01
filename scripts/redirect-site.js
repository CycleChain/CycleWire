#!/usr/bin/env node
/**
 * The site GitHub Pages serves once the real one lives elsewhere: every
 * address under the Pages path, the documentation's pages included, sends
 * the visitor to the same path at the new address, query and fragment kept.
 * GitHub Pages answers an unknown path with 404.html, so one page serves
 * them all; index.html answers the root.
 *
 *   CYCLEWIRE_SITE=https://cyclechain.io/labs/cyclewire/ node scripts/redirect-site.js [--out _redirect]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAGES, SITE } from './site-url.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The page that sends visitors from `from` to `to`.
 * @param {string} from the old site's URL
 * @param {string} to the new site's URL
 */
export function redirectPage(from, to) {
    const prefix = new URL(from).pathname;
    const target = JSON.stringify(to);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CycleWire has moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${to}">
<script>
    // The same page at the new address: ${prefix}docs/request/#x is ${to}docs/request/#x.
    location.replace(${target} + location.pathname.slice(${JSON.stringify(prefix)}.length) + location.search + location.hash);
</script>
<noscript><meta http-equiv="refresh" content="0; url=${to}"></noscript>
</head>
<body>
<p>CycleWire's site has moved to <a href="${to}">${to.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>.</p>
</body>
</html>
`;
}

/** @param {string} out */
export async function writeRedirectSite(out) {
    if (SITE === PAGES) throw new Error('Set CYCLEWIRE_SITE to the address the site moved to.');
    const page = redirectPage(PAGES, SITE);
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'index.html'), page);
    await writeFile(join(out, '404.html'), page);
    await writeFile(join(out, '.nojekyll'), '');
    console.log(`Wrote the redirect from ${PAGES} to ${SITE} in ${out}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const index = process.argv.indexOf('--out');
    await writeRedirectSite(index > -1 ? process.argv[index + 1] : join(root, '_redirect'));
}
