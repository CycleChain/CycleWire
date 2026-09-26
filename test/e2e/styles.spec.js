import { expect, test } from '@playwright/test';
import { boot, log, warnings } from './helpers.js';

const CSS = '/fixtures/styles/widget.css';
const STYLED = { module: '/fixtures/actions/styled.js', css: CSS };
const links = (page, rel) => page.locator(`link[rel="${rel}"][href$="widget.css"]`).count();

/** Starts CycleWire with the styles() plugin of cyclewire/css. */
const start = (page, actions) =>
    page.evaluate((map) => window.CW.start({ actions: map, plugins: [window.CWX.css.styles()] }), actions);

/** Opens the fixture page with `html` and starts it with the styles() plugin. */
async function styled(page, html, actions = { styled: STYLED }) {
    await boot(page, { start: false, html });
    await start(page, actions);
}

test.describe('cyclewire/css: action stylesheets', () => {
    test('apply before the handler runs', async ({ page }) => {
        await styled(page, '<button id="b" cw-action="styled">go</button>');
        expect(await links(page, 'stylesheet')).toBe(0);
        await page.click('#b');
        await expect.poll(() => log(page)).toEqual([{ fn: 'styled', el: 'b', color: 'rgb(1, 2, 3)' }]);
    });

    test('are preloaded on intent without being applied', async ({ page }) => {
        await styled(page, '<button id="b" cw-action="styled">go</button>');
        await page.hover('#b');
        await expect.poll(() => links(page, 'preload')).toBe(1);
        expect(await page.locator('link[rel="preload"][as="style"]').count()).toBe(1);
        expect(await links(page, 'stylesheet')).toBe(0);
    });

    test('are shared, and reuse a stylesheet the server already rendered', async ({ page }) => {
        await boot(page, {
            start: false,
            html: '<button id="a" cw-action="one">a</button><button id="b" cw-action="two">b</button>',
        });
        await page.evaluate(async (css) => {
            const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: css });
            await new Promise((resolve) => {
                link.onload = resolve;
                document.head.append(link);
            });
        }, CSS);
        await start(page, { one: STYLED, two: STYLED });
        await page.click('#a');
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(2);
        expect(await links(page, 'stylesheet')).toBe(1);
        expect((await log(page)).every((entry) => entry.color === 'rgb(1, 2, 3)')).toBe(true);
    });

    test('go before the page\'s own styles, so the page wins at equal specificity', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="b" cw-action="styled#order">go</button>' });
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '.order { color: rgb(9, 9, 9); }';
            document.head.append(style);
        });
        await start(page, { styled: STYLED });
        await page.click('#b');
        await expect.poll(() => log(page)).toEqual([{ fn: 'order', color: 'rgb(9, 9, 9)' }]);
        const first = await page.evaluate(() => document.querySelector('link[rel~="stylesheet"], style').outerHTML);
        expect(first).toContain('widget.css');
    });

    test('go into the shadow root of an action that lives there', async ({ page }) => {
        await styled(page, '<div id="host"></div>');
        await page.evaluate(() => {
            const root = document.getElementById('host').attachShadow({ mode: 'open' });
            root.innerHTML = '<button id="inside" cw-action="styled#shadow">go</button>';
        });
        await page.locator('#host').locator('#inside').click();
        await expect.poll(() => log(page)).toEqual([{ fn: 'shadow', color: 'rgb(1, 2, 3)' }]);
        expect(await page.evaluate(() => document.getElementById('host').shadowRoot.querySelectorAll('link[rel="stylesheet"]').length)).toBe(1);
        // Locators pierce shadow roots, so count the document's own links directly.
        expect(await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').length)).toBe(0);
    });

    test('a stylesheet that fails to load fails the run, and the next one retries', async ({ page }, info) => {
        const css = `/fail-once/styles-${info.project.name}-${Date.now()}/fixtures/styles/widget.css`;
        await styled(page, '<button id="b" cw-action="flaky" cw-preload="none">go</button>', {
            flaky: { module: '/fixtures/actions/styled.js', css },
        });
        await page.evaluate(() => {
            window.__errors = [];
            document.addEventListener('cw:error', (event) => window.__errors.push(event.detail.error.message));
        });
        await page.click('#b');
        await expect.poll(() => page.evaluate(() => window.__errors.length)).toBe(1);
        expect(await log(page)).toEqual([]);
        await page.click('#b');
        await expect.poll(() => log(page)).toEqual([{ fn: 'styled', el: 'b', color: 'rgb(1, 2, 3)' }]);
    });

    test('css() loads a stylesheet once and resolves when it applies', async ({ page }) => {
        await boot(page, { html: '<span class="widget" id="w">w</span>' });
        const color = await page.evaluate(async (css) => {
            const { css: load } = window.CWX.css;
            await Promise.all([load(css), load([css])]);
            return getComputedStyle(document.getElementById('w')).color;
        }, CSS);
        expect(color).toBe('rgb(1, 2, 3)');
        expect(await links(page, 'stylesheet')).toBe(1);
    });

    test('without the plugin, the core runs the action, skips the css and says why', async ({ page }) => {
        await boot(page, { actions: { styled: STYLED }, html: '<button id="b" cw-action="styled">go</button>' });
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(1);
        expect((await log(page))[0].color).not.toBe('rgb(1, 2, 3)');
        expect(await links(page, 'stylesheet')).toBe(0);
        expect(await warnings(page)).toContainEqual(expect.stringContaining('Add styles() from cyclewire/css'));
    });
});
