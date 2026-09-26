import { expect, test } from '@playwright/test';
import { log } from './helpers.js';

// cyclewire.full.global.min.js: every module in one classic script, with the
// styles and signals plugins installed from the JSON config.
test.describe('full classic-script build', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/fixtures/full.html');
        await page.waitForFunction(() => typeof window.CycleWire === 'object');
    });

    test('exposes every module on window.CycleWire', async ({ page }) => {
        const shape = await page.evaluate(() => {
            const { css, dom, morph, signals, stream, bootstrap } = window.CycleWire;
            return [typeof css, typeof dom.html, typeof morph, typeof signals.signal, typeof stream.connect, typeof bootstrap.bootstrap];
        });
        expect(shape).toEqual(['function', 'function', 'function', 'function', 'function', 'function']);
    });

    test('opens the stream channels the JSON config lists', async ({ page }) => {
        await expect(page.locator('#feed')).toHaveAttribute('cw-stream-state', 'open');
    });

    test('applies an action\'s stylesheet from the JSON config before its handler', async ({ page }) => {
        await expect.poll(() => log(page)).toEqual([{ fn: 'styled', el: 'widget', color: 'rgb(1, 2, 3)' }]);
    });

    test('resumes server state with the signals plugin', async ({ page }) => {
        await page.click('#inc');
        await expect(page.locator('#count')).toHaveText('3');
    });
});
