import { expect, test } from '@playwright/test';
import { boot, expectLog, log } from './helpers.js';

const FORM = `
    <form id="f" data-cw-action="log#submitter">
        <input id="q" name="q" value="hello">
        <button id="send" type="submit">Send</button>
    </form>`;

test.describe('forms', () => {
    test('a bound form runs once per submission and is not submitted natively', async ({ page }) => {
        await boot(page, { html: FORM });
        const url = page.url();
        await page.click('#send');
        await page.focus('#q');
        await page.keyboard.press('Enter');
        await page.evaluate(() => document.getElementById('f').requestSubmit());
        await expect.poll(async () => (await log(page)).map((entry) => `${entry.type}:${entry.submitter}`)).toEqual([
            'submit:send',
            'submit:send',
            'submit:null',
        ]);
        expect(page.url()).toBe(url);
    });

    test('clicks and typing inside a bound form do not run its action', async ({ page }) => {
        await boot(page, { html: FORM });
        await page.click('#q');
        await page.keyboard.type('!');
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
    });

    test('a bound text input runs on input, not on click', async ({ page }) => {
        await boot(page, { html: '<input id="search" data-cw-action="log#value">' });
        await page.click('#search');
        await page.waitForTimeout(100);
        expect(await log(page)).toEqual([]);
        await page.keyboard.type('a');
        await expectLog(page, [{ fn: 'value', el: 'search', type: 'input', target: 'search', value: 'a' }]);
    });

    test('checkboxes and selects run on change', async ({ page }) => {
        await boot(page, {
            html: `<input type="checkbox" id="c" data-cw-action="log#value">
                   <select id="s" data-cw-action="log#value"><option>a</option><option>b</option></select>`,
        });
        await page.check('#c');
        await page.selectOption('#s', 'b');
        await expect.poll(async () => (await log(page)).map((entry) => `${entry.el}:${entry.type}:${entry.value}`)).toEqual(['c:change:on', 's:change:b']);
    });

    test('an unregistered form falls back to a native submission', async ({ page }) => {
        await boot(page, { html: '<form id="f" action="/echo" method="post" data-cw-action="later"><input name="q" value="native"><button id="go">Go</button></form>' });
        await page.click('#go');
        await expect(page.locator('#echo')).toHaveText('POST /echo');
        await expect(page.locator('[data-field="q"]')).toHaveText('q=native');
    });

    test('a click action on a submit button keeps the form from submitting', async ({ page }) => {
        await boot(page, { html: '<form action="/echo"><button id="b" data-cw-action="log">Save draft</button></form>' });
        const url = page.url();
        await page.click('#b');
        await expectLog(page, [{ fn: 'run', el: 'b', type: 'click', target: 'b', props: null }]);
        expect(page.url()).toBe(url);
    });

    test('data-cw-prevent="none" lets the native submission happen as well', async ({ page }) => {
        await boot(page, { html: '<form id="f" action="/echo" data-cw-action="log" data-cw-prevent="none"><input name="q" value="both"><button id="go">Go</button></form>' });
        await page.click('#go');
        await expect(page.locator('#echo')).toHaveText('GET /echo');
    });
});
