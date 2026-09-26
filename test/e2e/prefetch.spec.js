import { expect, test } from '@playwright/test';
import { boot, expectLog } from './helpers.js';

// cyclewire/prefetch: data fetched on intent, taken by the handler's ctx.fetch.
const ITEM = '/fixtures/data/item.json';
const count = (page) => {
    const seen = [];
    page.on('request', (request) => {
        if (request.url().includes('/fixtures/data/')) seen.push(request.url());
    });
    return seen;
};
const start = (page, plugins = true) => page.evaluate((withPlugin) => {
    window.CW.start({
        actions: { timing: '/fixtures/actions/timing.js' },
        plugins: withPlugin ? [window.CWX.prefetch.prefetch()] : [],
    });
}, plugins);

test.describe('cyclewire/prefetch', () => {
    test('intent fetches the data next to the module, and the handler takes it without asking again', async ({ page }) => {
        const seen = count(page);
        await boot(page, { start: false, html: `<button id="b" cw-action="timing#item" cw-prefetch="${ITEM}">Show</button>` });
        await start(page);
        await page.hover('#b');
        await expect.poll(() => seen.length).toBe(1);
        await page.click('#b');
        await expectLog(page, [['item', 'Wire mug']]);
        expect(seen.length).toBe(1);
        // Taken once: the next run asks again.
        await page.click('#b');
        await expectLog(page, [['item', 'Wire mug'], ['item', 'Wire mug']]);
        expect(seen.length).toBe(2);
    });

    test('nothing is prefetched from another origin, inside cw-ignore, or with cw-preload="none"', async ({ page }) => {
        const outside = [];
        page.on('request', (request) => {
            if (request.url().startsWith('https://example.com')) outside.push(request.url());
        });
        const seen = count(page);
        await boot(page, {
            start: false,
            html: `<button id="away" cw-action="timing#quick" cw-prefetch="https://example.com/data.json">a</button>
                   <div cw-ignore><button id="ignored" cw-action="timing#quick" cw-prefetch="${ITEM}">b</button></div>
                   <button id="none" cw-action="timing#quick" cw-preload="none" cw-prefetch="${ITEM}">c</button>`,
        });
        await start(page);
        for (const id of ['away', 'ignored', 'none']) await page.hover(`#${id}`);
        await page.waitForTimeout(300);
        expect(outside).toEqual([]);
        expect(seen).toEqual([]);
    });

    test('a request that is not a plain GET goes out as it is', async ({ page }) => {
        const seen = count(page);
        await boot(page, { start: false, html: `<button id="b" cw-action="timing#quick" cw-prefetch="${ITEM}">b</button>` });
        await start(page);
        await page.hover('#b');
        await expect.poll(() => seen.length).toBe(1);
        const status = await page.evaluate(async (url) => {
            const { fetchAhead } = window.CWX.prefetch;
            return (await fetchAhead(url, { headers: { accept: 'application/json' } })).status;
        }, ITEM);
        expect(status).toBe(200);
        expect(seen.length).toBe(2);
    });

    test('without the plugin, cw-prefetch does nothing and handlers use the global fetch', async ({ page }) => {
        const seen = count(page);
        await boot(page, { start: false, html: `<button id="b" cw-action="timing#quick" cw-prefetch="${ITEM}">b</button>` });
        await start(page, false);
        await page.hover('#b');
        await page.waitForTimeout(200);
        expect(seen).toEqual([]);
    });
});

test('a handler that proved slow runs after a paint next time; a quick one runs at once', async ({ page }) => {
    await boot(page, { start: false, html: '<button id="quick" cw-action="timing#quick">q</button><button id="heavy" cw-action="timing#heavy">h</button>' });
    await page.evaluate(() => {
        window.__yields = [];
        window.CW.use({ trace: (event) => event.type === 'start' && window.__yields.push(`${event.action} ${event.yields}`) });
        window.CW.start({ actions: { timing: '/fixtures/actions/timing.js' } });
    });
    for (let i = 0; i < 2; i++) {
        await page.click('#quick');
        await page.click('#heavy');
    }
    await expectLog(page, ['quick', 'heavy', 'quick', 'heavy']);
    expect(await page.evaluate(() => window.__yields)).toEqual(['timing#quick false', 'timing#heavy false', 'timing#quick false', 'timing#heavy true']);
});

test('intent preloads at high priority, speculative ones at low', async ({ page }) => {
    await boot(page, { start: false, html: '<button id="now" cw-action="evaluated">now</button><div class="spacer"></div><button id="later" cw-action="log" cw-preload="visible">later</button>' });
    const supported = await page.evaluate(() => 'fetchPriority' in HTMLLinkElement.prototype);
    test.skip(!supported, 'This browser has no priority hints.');
    await page.evaluate(() => window.CW.start({ actions: { evaluated: '/fixtures/actions/evaluated.js', log: '/fixtures/actions/log.js' } }));
    await page.hover('#now');
    await expect(page.locator('link[rel="modulepreload"][href$="evaluated.js"]')).toHaveAttribute('fetchpriority', 'high');
    await page.locator('#later').scrollIntoViewIfNeeded();
    await expect(page.locator('link[rel="modulepreload"][href$="log.js"]')).toHaveAttribute('fetchpriority', 'low');
});
