import { expect, test } from '@playwright/test';

// cyclewire/early: what people do before CycleWire starts is kept and run
// once it starts. The fixture page imports CycleWire only when the spec
// calls window.__go(), so "before" is exact rather than a race.
const go = async (page) => {
    await page.evaluate(() => window.__go());
    await page.waitForFunction(() => window.__started === true);
};
const log = (page) => page.evaluate(() => window.__log);

test.describe('cyclewire/early', () => {
    test('a tap before CycleWire starts shows at once and runs once it starts', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.click('#like');
        // The control shows the tap right away, before any code for it exists.
        await expect(page.locator('#like')).toHaveAttribute('cw-pending', '');
        expect(await log(page)).toEqual([]);
        await go(page);
        await expect.poll(() => log(page)).toEqual([{ fn: 'run', el: 'like', type: 'click', target: 'like', props: null }]);
        await expect(page.locator('#like')).not.toHaveAttribute('cw-pending');
    });

    test('without it, the same tap is lost', async ({ page }) => {
        await page.goto('/fixtures/early.html?early=0');
        await page.click('#like');
        await go(page);
        await page.waitForTimeout(300);
        expect(await log(page)).toEqual([]);
    });

    test('typing before it starts runs once, with what was typed', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.type('#search', 'lamp');
        await go(page);
        await expect.poll(() => log(page)).toEqual([{ fn: 'run', el: 'search', type: 'input', target: 'search', props: null }]);
        await expect(page.locator('#search')).toHaveValue('lamp');
    });

    test('taps run in the order they came, and nothing inside cw-ignore is kept', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.click('#ignored');
        await page.click('#plain');
        await page.click('#like');
        await page.type('#search', 'a');
        await expect(page.locator('#ignored')).not.toHaveAttribute('cw-pending');
        await go(page);
        await expect.poll(() => (log(page)).then((entries) => entries.map((entry) => `${entry.el}:${entry.type}`))).toEqual(['like:click', 'search:input']);
    });

    test('taps after it starts are CycleWire\'s own, never run twice', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.click('#like');
        await go(page);
        await expect.poll(() => log(page).then((entries) => entries.length)).toBe(1);
        await page.click('#like');
        await expect.poll(() => log(page).then((entries) => entries.length)).toBe(2);
        await page.waitForTimeout(200);
        expect((await log(page)).length).toBe(2);
    });

    test('a link is left to the browser, which follows it at once', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await Promise.all([page.waitForURL('**/fixtures/boot.html'), page.click('#away')]);
    });

    test('a submit button is left to the browser too: the form submits, and the action does not run as well', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        const sink = page.frame({ name: 'sink' });
        await Promise.all([sink.waitForURL(/fixtures\/boot\.html/), page.click('#send')]);
        await go(page);
        await page.waitForTimeout(300);
        expect(await log(page)).toEqual([]);
        await expect(page.locator('#send')).not.toHaveAttribute('cw-pending');
    });

    test('a click that runs nothing marks nothing: a field in a form bound to its submit', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.click('#email');
        await page.type('#email', 'a@b.c');
        await expect(page.locator('#subscribe')).not.toHaveAttribute('cw-pending');
        await go(page);
        await page.waitForTimeout(300);
        expect(await log(page)).toEqual([]);
    });

    test('a link to "#" goes nowhere, so its action runs', async ({ page }) => {
        await page.goto('/fixtures/early.html');
        await page.click('#top');
        await go(page);
        await expect.poll(() => log(page)).toEqual([{ fn: 'run', el: 'top', type: 'click', target: 'top', props: null }]);
    });
});
