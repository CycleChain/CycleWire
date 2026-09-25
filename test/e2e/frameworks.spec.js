import { expect, test } from '@playwright/test';

// The React, Vue and Svelte examples (examples/<framework>/, built by
// test/global-setup.js): one page and one component per framework, rendered
// on the server and hydrated by a CycleWire action when it scrolls into view.
for (const framework of ['react', 'vue', 'svelte']) {
    test.describe(`${framework} island`, () => {
        /** Console errors and warnings: hydration mismatches, CycleWire's development warnings. */
        let problems;

        test.beforeEach(async ({ page }) => {
            problems = [];
            page.on('console', (message) => {
                if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
            });
            page.on('pageerror', (error) => problems.push(error.message));
            await page.goto(`/examples/${framework}/`);
            await page.waitForFunction(() => typeof window.wire === 'object');
        });

        /** Scrolls the island into view and waits until the framework has taken it over. */
        async function hydrate(page) {
            await page.locator('#counter').scrollIntoViewIfNeeded();
            await expect(page.locator('#counter .counter[data-ready]')).toBeAttached();
        }

        const scripts = (page) =>
            page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.endsWith('.js')));

        test('is rendered on the server, and its framework loads only when it scrolls into view', async ({ page }) => {
            await expect(page.locator('#counter .counter__value')).toHaveText('3');
            await page.waitForLoadState('networkidle');
            expect(await page.evaluate(() => window.wire.loaded())).toEqual([]);
            expect((await scripts(page)).some((name) => name.includes('/islands-'))).toBe(false);

            await hydrate(page);
            expect(await page.evaluate(() => window.wire.loaded())).toEqual(['islands']);
            expect((await scripts(page)).some((name) => name.includes('/islands-'))).toBe(true);
        });

        test('hydrates the server HTML without a mismatch, and becomes interactive', async ({ page }) => {
            await hydrate(page);
            await page.click('.counter__inc');
            await expect(page.locator('.counter__value')).toHaveText('4');
            expect(problems).toEqual([]);
        });

        test('a CycleWire action inside the island sends what the framework rendered, and the island hears back', async ({ page }) => {
            await hydrate(page);
            await page.click('.counter__inc');
            await page.click('.counter__inc');
            await expect(page.locator('.counter__value')).toHaveText('5');
            await page.click('.counter__save');
            await expect(page.locator('.counter__status')).toHaveText('Saved 5');
            expect((await page.evaluate(() => window.wire.loaded())).sort()).toEqual(['counter', 'islands']);
            expect(problems).toEqual([]);
        });

        test('unmounts when its element leaves the page', async ({ page }) => {
            await hydrate(page);
            await page.evaluate(() => {
                window.__island = document.getElementById('counter');
                window.__island.remove();
            });
            // Unmounting removes what the framework rendered from the detached element.
            await page.waitForFunction(() => window.__island.querySelector('.counter') === null);
            expect(problems).toEqual([]);
        });
    });
}
