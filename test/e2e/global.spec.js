import { expect, test } from '@playwright/test';
import { log } from './helpers.js';

// The classic-script build, configured by a JSON block, with prefix "".
test.describe('classic-script build', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/fixtures/global.html');
        await page.waitForFunction(() => typeof window.CycleWire === 'object');
    });

    test('starts from the JSON config, with unprefixed attributes', async ({ page }) => {
        await expect.poll(async () => (await log(page)).map((entry) => [entry.el, entry.type])).toEqual([['widget', null]]);
        await page.click('#like');
        await expect.poll(async () => (await log(page)).map((entry) => entry.el)).toEqual(['widget', 'like']);
        expect((await page.evaluate(() => window.CycleWire.loaded())).sort()).toEqual(['like', 'widget']);
        // data-once: the widget initialised exactly once.
        await page.evaluate(() => window.CycleWire.scan());
        await page.waitForTimeout(100);
        expect((await log(page)).filter((entry) => entry.el === 'widget')).toHaveLength(1);
    });

    test('outbound links open and still run their action', async ({ page, context }) => {
        const popup = context.waitForEvent('page');
        await page.click('#outbound');
        expect((await popup).url()).toContain('#outbound');
        await expect.poll(async () => (await log(page)).some((entry) => entry.el === 'outbound')).toBe(true);
    });
});
