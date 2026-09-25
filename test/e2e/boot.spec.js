import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// The whole architecture rests on this: server-rendered markup, one small
// script, and no action module until the user reaches for one. An eager
// import anywhere would silently undo it, so it is pinned down first.
test.describe('boot', () => {
    test('loads one small script and no action module until one is used', async ({ page }) => {
        const scripts = [];
        page.on('request', (request) => {
            if (request.resourceType() === 'script' || request.url().endsWith('.js')) scripts.push(new URL(request.url()).pathname);
        });
        await page.goto('/fixtures/boot.html');
        await page.waitForLoadState('load');
        await page.waitForFunction(() => window.__ready === true);

        expect(scripts).toEqual(['/fixtures/harness.js', '/dist/cyclewire.min.js']);
        expect(await page.evaluate(() => window.CW.loaded())).toEqual([]);

        await page.click('#like');
        await expect.poll(() => page.evaluate(() => window.__log.length)).toBe(1);
        expect(await page.evaluate(() => window.CW.loaded())).toEqual(['log']);
        expect(scripts).toContain('/fixtures/actions/log.js');
        expect(scripts).not.toContain('/fixtures/actions/gated.js');
    });

    test('exposes the documented API and version', async ({ page }) => {
        await page.goto('/fixtures/boot.html');
        await page.waitForFunction(() => window.__ready === true);
        const api = await page.evaluate(() => ({ keys: Object.keys(window.CW).sort(), version: window.CW.version }));
        expect(api.keys).toEqual(['fromGlob', 'listen', 'loaded', 'observe', 'preload', 'register', 'run', 'scan', 'start', 'stop', 'use', 'version']);
        expect(api.version).toBe(pkg.version);
    });
});
