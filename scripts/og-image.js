#!/usr/bin/env node
/**
 * Renders the social preview image (site/og.png, 1280×640) from
 * scripts/og.html with Playwright. Run it by hand after changing the design,
 * and commit the image. The landing page points og:image at it, and the same
 * file can be uploaded as the repository's social preview on GitHub.
 *
 *   node scripts/og-image.js            (PW_CHANNEL=chrome to use your installed Chrome)
 */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const template = fileURLToPath(new URL('og.html', import.meta.url));
const out = fileURLToPath(new URL('../site/og.png', import.meta.url));

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(await readFile(template, 'utf8'));
await page.screenshot({ path: out });
await browser.close();
console.log(`Wrote ${out}`);
