import { expect, test } from '@playwright/test';

// cyclewire/request: links, forms and buttons that fetch HTML and put it into
// the page, declared in markup. /echo answers with the method, the fields and
// the X-CSRF-Token it received.
const open = async (page, build = 'esm-dev', prefix = '') => {
    await page.goto(`/fixtures/request.html?build=${build}${prefix && `&prefix=${prefix}`}`);
    await page.waitForFunction(() => window.__ready === true);
};
const errors = (page) => page.evaluate(() => window.__errors);

test.describe('cyclewire/request', () => {
    test('a link fetches a page and appends the part cw-select picks, without leaving', async ({ page }) => {
        await open(page);
        await page.click('#more');
        await expect(page.locator('#list li')).toHaveText(['one', 'two', 'three']);
        expect(new URL(page.url()).pathname).toBe('/fixtures/request.html');
        await expect(page.locator('body h1')).toHaveCount(0);
    });

    test('a form posts its fields, the button that sent it and the CSRF token, and gives way to the answer', async ({ page }) => {
        await open(page);
        await page.click('#join');
        await expect(page.locator('#echo')).toHaveText('POST /echo');
        await expect(page.locator('#signup')).toHaveCount(0);
        await expect(page.locator('[data-field]')).toHaveText(['email=a@b.c', 'plan=pro']);
        await expect(page.locator('#csrf')).toHaveText('t0ken');
    });

    test('a form sent back with its errors (422) is shown like any answer', async ({ page }) => {
        await open(page);
        await page.click('#send-invalid');
        await expect(page.locator('#echo')).toHaveText('POST /echo');
        await expect(page.locator('#invalid')).toHaveCount(0);
        expect(await errors(page)).toEqual([]);
    });

    test('a field sends its value in the query, and the last of a burst of typing wins', async ({ page }) => {
        await open(page);
        const asked = [];
        page.on('request', (request) => request.url().includes('/echo') && asked.push(new URL(request.url()).search));
        await page.locator('#q').pressSequentially('lamp');
        await expect(page.locator('#results [data-field="q"]')).toHaveText('q=lamp');
        await expect(page.locator('#results #echo')).toHaveText('GET /echo');
        expect(asked.at(-1)).toBe('?q=lamp');
    });

    test('a button posts to its cw-post URL, with the CSRF token', async ({ page }) => {
        await open(page);
        await page.click('#add');
        await expect(page.locator('#cart #echo')).toHaveText('POST /echo');
        await expect(page.locator('#cart #csrf')).toHaveText('t0ken');
    });

    test('cw-delete sends a DELETE, and cw-swap="remove" takes the closest card away', async ({ page }) => {
        await open(page);
        const sent = page.waitForRequest((request) => request.url().endsWith('/echo'));
        await page.click('#close');
        expect((await sent).method()).toBe('DELETE');
        await expect(page.locator('.card')).toHaveCount(0);
    });

    test('204 No Content changes nothing, but a target to remove goes', async ({ page }) => {
        await open(page);
        await page.click('#add');
        await expect(page.locator('#cart #echo')).toHaveText('POST /echo');
        const quiet = page.waitForResponse((response) => response.url().endsWith('/echo?status=204'));
        await page.click('#quiet');
        expect((await quiet).status()).toBe(204);
        await page.waitForTimeout(100);
        await expect(page.locator('#cart #echo')).toHaveText('POST /echo');
        await page.click('#dismiss');
        await expect(page.locator('.note')).toHaveCount(0);
        expect(await errors(page)).toEqual([]);
    });

    test('a target that does not exist fails before anything is sent', async ({ page }) => {
        await open(page);
        const asked = [];
        page.on('request', (request) => request.url().includes('nowhere') && asked.push(request.url()));
        await page.click('#nowhere');
        await expect.poll(() => errors(page)).toEqual([expect.stringContaining('nothing matches #missing')]);
        expect(asked).toEqual([]);
    });

    for (const build of ['esm-dev', 'min']) {
        test(`the <cw-stream> messages of an answer change what they name, and the rest goes to the target (${build})`, async ({ page }) => {
            await open(page, build);
            await page.click('#streamed');
            await expect(page.locator('#box #main')).toHaveText('main');
            await expect(page.locator('#a')).toHaveText('A!');
            await expect(page.locator('#b')).toHaveText('bB!');
            await expect(page.locator('#box cw-stream')).toHaveCount(0);
        });

        test(`morph keeps what was typed (${build})`, async ({ page }) => {
            await open(page, build);
            await page.fill('#keep', 'typed');
            await page.click('#bump');
            await expect(page.locator('#counter span')).toHaveText('1');
            await expect(page.locator('#keep')).toHaveValue('typed');
            await expect(page.locator('#counter')).toHaveCount(1);
        });
    }

    test('another origin is refused before anything is sent', async ({ page }) => {
        await open(page);
        const away = [];
        page.on('request', (request) => request.url().startsWith('https://example.com') && away.push(request.url()));
        await page.click('#away');
        await expect.poll(() => errors(page)).toEqual([expect.stringContaining("is not on this page's origin")]);
        expect(away).toEqual([]);
    });

    test('an error answer changes nothing, and is reported', async ({ page }) => {
        await open(page);
        await page.click('#broken');
        await expect.poll(() => errors(page)).toEqual([expect.stringContaining('answered 500')]);
        await expect(page.locator('#results #before')).toHaveText('before');
    });

    test('scripts in an answer never run', async ({ page }) => {
        await open(page);
        await page.click('#script');
        await expect(page.locator('#scripted')).toHaveText('scripted');
        expect(await page.evaluate(() => window.__ran)).toBeUndefined();
    });

    test('it reads its attributes with the prefix start() was given', async ({ page }) => {
        await open(page, 'esm-dev', 'data-cw-');
        await page.click('#more');
        await expect(page.locator('#list li')).toHaveText(['one', 'two', 'three']);
        await page.click('#add');
        await expect(page.locator('#cart #echo')).toHaveText('POST /echo');
    });

    test('a trigger loads a section once it is in view', async ({ page }) => {
        await open(page);
        await expect(page.locator('#lazy')).toHaveText('Loaded');
    });

    test('an empty cw-prefetch fetches the link on intent, and the click takes that response', async ({ page }) => {
        await open(page);
        const asked = [];
        page.on('request', (request) => request.url().includes('page.html?ahead') && asked.push(request.url()));
        await page.hover('#ahead');
        await expect.poll(() => asked.length).toBe(1);
        await page.click('#ahead');
        await expect(page.locator('#list li')).toHaveText(['one', 'two', 'three']);
        expect(asked.length).toBe(1);
    });
});
