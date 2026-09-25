import { expect, test } from '@playwright/test';
import { log } from './helpers.js';

const ACTIONS = { log: '/fixtures/actions/log.js' };
const entries = async (page) => (await log(page)).map((entry) => `${entry.fn}:${entry.el}:${entry.type}`);

test.describe('shadow DOM', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/fixtures/shadow.html');
        await page.waitForFunction(() => window.__ready === true);
    });

    test('composed events work inside open shadow roots without observe()', async ({ page }) => {
        await page.evaluate((actions) => window.CW.start({ actions }), ACTIONS);
        await page.locator('#host').locator('#inner').click();
        await expect.poll(() => entries(page)).toEqual(['run:inner:click']);
        const target = await log(page);
        expect(target[0].target).toBe('inner');
    });

    test('submit and change inside a shadow root run once observe() is called', async ({ page }) => {
        await page.evaluate((actions) => {
            window.CW.start({ actions });
            window.CW.observe(document.getElementById('host').shadowRoot);
        }, ACTIONS);
        const host = page.locator('#host');
        await expect.poll(() => entries(page)).toEqual(['second:inner-load:null']);
        await host.locator('#inner-submit').click();
        await host.locator('#inner-select').selectOption('b');
        await host.locator('#inner').click();
        await expect.poll(() => entries(page)).toEqual(['second:inner-load:null', 'run:inner-form:submit', 'run:inner-select:change', 'run:inner:click']);
        expect(page.url()).not.toContain('q=');
    });

    test('shadow: true observes declarative shadow roots found at start', async ({ page }) => {
        await page.evaluate((actions) => window.CW.start({ actions, shadow: true }), ACTIONS);
        await expect.poll(() => entries(page)).toEqual(['second:inner-load:null']);
        await page.locator('#host').locator('#inner-submit').click();
        await expect.poll(() => entries(page)).toEqual(['second:inner-load:null', 'run:inner-form:submit']);
    });
});
