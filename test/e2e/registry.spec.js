import { expect, test } from '@playwright/test';
import { boot, expectLog, log } from './helpers.js';

test.describe('registry and preloading', () => {
    test('relative URLs resolve against the page, not against the library', async ({ page }) => {
        // The page lives under /fixtures/, the library under /dist/esm-dev/.
        await boot(page, { actions: { rel: './actions/log.js' }, html: '<button id="b" data-cw-action="rel">go</button>' });
        await page.click('#b');
        await expectLog(page, [{ fn: 'run', el: 'b', type: 'click', target: 'b', props: null }]);
    });

    test('bare specifiers go through the import map', async ({ page }) => {
        await page.goto('/fixtures/importmap.html');
        await page.waitForFunction(() => window.__ready === true);
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(1);
    });

    test('registered() lists every registered name, loaded() only the imported ones', async ({ page }) => {
        await boot(page, { html: '<button id="b" data-cw-action="log">go</button>' });
        expect(await page.evaluate(() => window.CW.registered())).toEqual(['log', 'gated', 'evaluated']);
        expect(await page.evaluate(() => window.CW.loaded())).toEqual([]);
        await page.evaluate(() => window.CW.register({ extra: '/fixtures/actions/log.js' }));
        await page.click('#b');
        await expect.poll(() => page.evaluate(() => window.CW.loaded())).toEqual(['log']);
        expect(await page.evaluate(() => window.CW.registered())).toEqual(['log', 'gated', 'evaluated', 'extra']);
        // defineAction() only exists for types: it returns the handler as it is.
        expect(await page.evaluate(() => {
            const handler = () => {};
            return window.CW.defineAction(handler) === handler && window.CW.run === window.CW.start().run;
        })).toBe(true);
    });

    test('names that are not registered are never imported', async ({ page }) => {
        const requests = [];
        page.on('request', (request) => requests.push(request.url()));
        await boot(page, { html: '<button id="b" data-cw-action="../../evil.js">go</button><button id="c" data-cw-action="https://example.com/x.js">go</button>' });
        await page.click('#b');
        await page.click('#c');
        await page.waitForTimeout(150);
        expect(requests.filter((url) => url.includes('evil') || url.startsWith('https://example.com'))).toEqual([]);
    });

    // The server fails each token once. Browsers share the server, so tokens are per run.
    const token = (info, name) => `${name}-${info.project.name}-${Date.now()}`;

    test('a module that failed to load is retried on the next interaction', async ({ page }, info) => {
        const url = `/fail-once/${token(info, 'retry')}/fixtures/actions/log.js`;
        await boot(page, { actions: { flaky: url }, html: '<button id="b" data-cw-action="flaky" data-cw-preload="none">go</button>' });
        await page.click('#b');
        await page.waitForTimeout(200);
        expect(await log(page)).toEqual([]);
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(1);
    });

    test('a failed preload does not break the first click', async ({ page }, info) => {
        const url = `/fail-once/${token(info, 'preload')}/fixtures/actions/log.js`;
        await boot(page, { actions: { flaky: url }, html: '<button id="b" data-cw-action="flaky">go</button>' });
        await page.hover('#b');
        await page.waitForTimeout(200);
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(1);
    });

    test('hovering preloads URL modules with modulepreload, without evaluating them', async ({ page }) => {
        await boot(page, { html: '<button id="b" data-cw-action="evaluated">go</button>' });
        await page.hover('#b');
        await expect(page.locator('link[rel="modulepreload"][href$="/fixtures/actions/evaluated.js"]')).toHaveCount(1);
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
        await page.click('#b');
        await expectLog(page, [['evaluated'], ['run']]);
    });

    test('hovering inside data-cw-ignore preloads nothing', async ({ page }) => {
        await boot(page, { html: '<div data-cw-ignore><button id="b" data-cw-action="evaluated">go</button></div>' });
        await page.hover('#b');
        await page.waitForTimeout(300);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
        expect(await log(page)).toEqual([]);
    });

    test('loader functions are imported on intent', async ({ page }) => {
        await boot(page, { actions: {}, html: '<button id="b" data-cw-action="fn">go</button>' });
        await page.evaluate(() => window.CW.register({ fn: () => import('/fixtures/actions/evaluated.js') }));
        await page.hover('#b');
        await expectLog(page, [['evaluated']]);
    });

    test('Save-Data and data-cw-preload="none" turn intent preloading off', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="a" data-cw-action="log">a</button><button id="b" data-cw-action="evaluated" data-cw-preload="none">b</button>' });
        await page.evaluate(() => {
            window.CW.start({ actions: { log: '/fixtures/actions/log.js', evaluated: '/fixtures/actions/evaluated.js' } });
        });
        await page.hover('#b');
        await page.waitForTimeout(100);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
        await page.evaluate(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
        await page.hover('#a');
        await page.waitForTimeout(100);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
        // An explicit preload() ignores Save-Data.
        await page.evaluate(() => window.CW.preload('log'));
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(1);
    });

    test('data-cw-preload="visible" fetches when the element nears the viewport', async ({ page }) => {
        await boot(page, { html: '<div class="spacer"></div><button id="b" data-cw-action="evaluated" data-cw-preload="visible">b</button>' });
        await page.waitForTimeout(150);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
        await page.locator('#b').scrollIntoViewIfNeeded();
        await expect(page.locator('link[rel="modulepreload"]')).toHaveCount(1);
    });

    test('intent fetches a module whose scheduled preload has not happened yet', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="b" data-cw-action="evaluated" data-cw-preload="idle">b</button>' });
        // The browser never goes idle.
        await page.evaluate(() => {
            window.requestIdleCallback = () => 0;
            window.CW.start({ actions: { evaluated: '/fixtures/actions/evaluated.js' } });
        });
        await page.waitForTimeout(100);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
        await page.hover('#b');
        await expect(page.locator('link[rel="modulepreload"]')).toHaveCount(1);
    });

    // Screens that cannot hover get no warning before a tap.
    const touchScreen = () => {
        const native = window.matchMedia.bind(window);
        window.matchMedia = (query) => (query === '(hover: none)' ? { ...native(query), matches: true } : native(query));
    };

    test('on screens that cannot hover, actions in view are fetched once the page is idle', async ({ page }) => {
        await boot(page, {
            start: false,
            html: `<button id="near" data-cw-action="evaluated">near</button>
                   <button id="own" data-cw-action="log" data-cw-preload="none">own choice</button>
                   <div class="spacer"></div>
                   <button id="far" data-cw-action="state">far</button>`,
        });
        await page.evaluate(touchScreen);
        await page.evaluate(() => window.CW.start({ actions: { evaluated: '/fixtures/actions/evaluated.js', log: '/fixtures/actions/log.js', state: '/fixtures/actions/state.js' } }));
        const hints = page.locator('link[rel="modulepreload"]');
        await expect(hints).toHaveCount(1);
        await expect(hints).toHaveAttribute('href', /\/evaluated\.js$/);
        // Fetched, not run.
        expect(await log(page)).toEqual([]);
        await page.locator('#far').scrollIntoViewIfNeeded();
        await expect(hints).toHaveCount(2);
        await expect(hints.nth(1)).toHaveAttribute('href', /\/state\.js$/);
    });

    test('preload: "intent" keeps every fetch waiting for intent, and "visible" looks ahead on every screen', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="b" data-cw-action="evaluated">b</button>' });
        await page.evaluate(touchScreen);
        await page.evaluate(() => window.CW.start({ preload: 'intent', actions: { evaluated: '/fixtures/actions/evaluated.js' } }));
        await page.waitForTimeout(300);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);

        // A screen that can hover.
        await boot(page, { start: false, html: '<button id="b" data-cw-action="evaluated">b</button>' });
        await page.evaluate(() => window.CW.start({ actions: { evaluated: '/fixtures/actions/evaluated.js' } }));
        await page.waitForTimeout(300);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);

        await boot(page, { start: false, html: '<button id="b" data-cw-action="evaluated">b</button>' });
        await page.evaluate(() => window.CW.start({ preload: 'visible', actions: { evaluated: '/fixtures/actions/evaluated.js' } }));
        await expect(page.locator('link[rel="modulepreload"]')).toHaveCount(1);
    });
});
