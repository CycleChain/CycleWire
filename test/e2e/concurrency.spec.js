import { expect, test } from '@playwright/test';
import { boot, expectLog, log, open, waitForLog } from './helpers.js';

test.describe('concurrency', () => {
    test('drop (click default): a second click while running is ignored, nothing is aborted', async ({ page }) => {
        await boot(page, { html: '<button id="b" data-cw-action="gated">go</button>' });
        await page.click('#b');
        await waitForLog(page, '"start"');
        await expect(page.locator('#b')).toHaveAttribute('data-cw-pending', '');
        await expect(page.locator('#b')).toHaveAttribute('aria-busy', 'true');
        await page.click('#b');
        await page.waitForTimeout(100);
        await open(page, 'b');
        await expectLog(page, [['start', 'b', 'click'], ['end', 'b']]);
        await expect(page.locator('#b')).not.toHaveAttribute('data-cw-pending');
        await expect(page.locator('#b')).not.toHaveAttribute('aria-busy');
    });

    test('restart (input default): new input aborts the stale run and runs', async ({ page }) => {
        await boot(page, { html: '<input id="i" data-cw-action="gated">' });
        await page.focus('#i');
        await page.keyboard.type('a');
        await waitForLog(page, '"start"');
        await page.keyboard.type('b');
        await expect.poll(async () => (await log(page)).length).toBe(3);
        await open(page, 'i');
        await expectLog(page, [['start', 'i', 'input'], ['abort', 'i'], ['start', 'i', 'input'], ['end-aborted', 'i'], ['end', 'i']]);
    });

    test('latest (change default): runs the last event after the current run', async ({ page }) => {
        await boot(page, { html: '<select id="s" data-cw-action="gated"><option>a</option><option>b</option><option>c</option></select>' });
        await page.selectOption('#s', 'b');
        await waitForLog(page, '"start"');
        await page.selectOption('#s', 'c');
        await page.selectOption('#s', 'a');
        await page.waitForTimeout(100);
        expect(await log(page)).toEqual([['start', 's', 'change']]);
        await open(page, 's');
        // Starting the queued run aborts the finished run's signal, so
        // listeners it tied to that signal are released.
        await expect.poll(async () => (await log(page)).length).toBe(4);
        await open(page, 's');
        await expectLog(page, [['start', 's', 'change'], ['end', 's'], ['abort', 's'], ['start', 's', 'change'], ['end', 's']]);
    });

    test('parallel: every event starts its own run', async ({ page }) => {
        await boot(page, { html: '<button id="p" data-cw-action="gated" data-cw-concurrency="parallel">go</button>' });
        await page.click('#p');
        await page.click('#p');
        await expect.poll(async () => (await log(page)).length).toBe(2);
        await open(page, 'p');
        await expectLog(page, [['start', 'p', 'click'], ['start', 'p', 'click'], ['end', 'p'], ['end', 'p']]);
    });

    test('a later run aborts the signal of the previous one on the same element', async ({ page }) => {
        await boot(page, { html: '<div id="d"></div>' });
        const aborted = await page.evaluate(async () => {
            const signals = [];
            window.CW.register({ capture: () => Promise.resolve({ run: ({ signal }) => signals.push(signal) }) });
            const el = document.getElementById('d');
            await window.CW.run('capture', el);
            await window.CW.run('capture', el);
            return signals.map((signal) => signal.aborted);
        });
        expect(aborted).toEqual([true, false]);
    });

    test('once: counts only a successful run, then consumes further events', async ({ page }) => {
        await boot(page, { html: '<a id="o" href="#" data-cw-action="gated#flaky" data-cw-once>once</a>' });
        const before = page.url();
        await page.click('#o');
        await waitForLog(page, '"fail"');
        await page.click('#o');
        await waitForLog(page, '"ok"');
        await page.click('#o');
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([['fail', 'o'], ['ok', 'o']]);
        // Consumed events are still prevented.
        expect(page.url()).toBe(before);
    });

    test('debounce: only the last event in a burst runs', async ({ page }) => {
        await boot(page, { html: '<input id="i" data-cw-action="log#value" data-cw-debounce="400">' });
        await page.focus('#i');
        await page.keyboard.type('abc');
        await expectLog(page, [{ fn: 'value', el: 'i', type: 'input', target: 'i', value: 'abc' }]);
    });

    test('removing an element aborts its run', async ({ page }) => {
        await boot(page, { html: '<button id="r" data-cw-action="gated">go</button>' });
        await page.click('#r');
        await waitForLog(page, '"start"');
        await page.evaluate(() => document.getElementById('r').remove());
        await waitForLog(page, '"abort"');
        await open(page, 'r');
        await expectLog(page, [['start', 'r', 'click'], ['abort', 'r'], ['end-aborted', 'r']]);
    });
});
