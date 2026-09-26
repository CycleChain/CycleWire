import { expect, test } from '@playwright/test';
import { boot, expectLog, log } from './helpers.js';

// The panel lives in an open shadow root; Playwright's locators pierce it.
const panel = (page) => page.locator('cyclewire-devtools');
const region = (page) => page.getByRole('region', { name: 'CycleWire devtools' });
const tab = (page, name) => page.getByRole('tab', { name });
const rows = (page, id) => panel(page).locator(`#${id} tr`);

/** Imports the devtools module of the page's build and installs the panel. */
const install = (page, options = {}, file = '/dist/esm-dev/devtools.js') => page.evaluate(async ({ options, file }) => {
    const { install } = await import(file);
    window.__uninstall = install(options);
}, { options, file });

/** What the page itself consists of, minus the panel. */
const snapshot = (page) => page.evaluate(() => ({
    head: document.head.outerHTML,
    body: document.body.outerHTML,
    html: document.documentElement.getAttributeNames().map((name) => `${name}=${document.documentElement.getAttribute(name)}`),
}));

test.describe('devtools', () => {
    test('install() mounts one panel, and the function it returns removes it', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button>' });
        await install(page);
        await install(page);
        await expect(panel(page)).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'CycleWire devtools' })).toBeVisible();
        await expect(region(page)).toBeHidden();

        await page.evaluate(() => window.__uninstall());
        await expect(panel(page)).toHaveCount(0);
        // Its listeners went with it: the shortcut does nothing, and a later install starts afresh.
        await page.keyboard.press('Alt+Shift+KeyW');
        await expect(panel(page)).toHaveCount(0);
        await install(page, { open: true });
        await expect(region(page)).toBeVisible();
    });

    test('Alt+Shift+W and Escape open and close the panel, and focus returns', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button>' });
        await install(page);
        await page.focus('#b');
        await page.keyboard.press('Alt+Shift+KeyW');
        await expect(region(page)).toBeVisible();
        await expect(tab(page, 'Actions')).toBeFocused();
        await expect(page.getByRole('button', { name: 'CycleWire devtools' })).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Alt+Shift+KeyW');
        await expect(region(page)).toBeHidden();
        await expect(page.locator('#b')).toBeFocused();

        await page.keyboard.press('Alt+Shift+KeyW');
        await expect(tab(page, 'Actions')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(region(page)).toBeHidden();
        await expect(page.locator('#b')).toBeFocused();
    });

    test('the tab list follows the tabs pattern', async ({ page }) => {
        await boot(page);
        await install(page, { open: true });
        await expect(page.getByRole('tab')).toHaveCount(5);
        await tab(page, 'Actions').focus();
        await page.keyboard.press('ArrowRight');
        await expect(tab(page, 'Runs')).toBeFocused();
        await expect(tab(page, 'Runs')).toHaveAttribute('aria-selected', 'true');
        await expect(tab(page, 'Runs')).toHaveAttribute('tabindex', '0');
        await expect(tab(page, 'Actions')).toHaveAttribute('tabindex', '-1');
        await expect(page.getByRole('tabpanel', { name: 'Runs' })).toBeVisible();
        await expect(page.getByRole('tabpanel', { name: 'Actions' })).toBeHidden();
        await page.keyboard.press('End');
        await expect(tab(page, 'Element')).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(tab(page, 'Actions')).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(tab(page, 'Element')).toBeFocused();
        await page.keyboard.press('Home');
        await expect(tab(page, 'Actions')).toBeFocused();
        await expect(page.getByRole('tabpanel', { name: 'Actions' })).toBeVisible();
    });

    test('Actions lists the registered names, their elements and runs, and names nobody registered', async ({ page }) => {
        await boot(page, {
            html: `<button id="b" cw-action="log">go</button>
                   <button id="c" cw-on-keydown="log#second" cw-action="gated">gated</button>
                   <button id="m" cw-action="missing">missing</button>`,
        });
        await install(page, { open: true });
        const row = (name) => rows(page, 'actions').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
        await expect(rows(page, 'actions').getByRole('rowheader')).toHaveText(['log', 'gated', 'evaluated', 'missing not registered']);
        await expect(row('log').getByRole('cell')).toHaveText(['no', '2', '0', '0', 'PreloadOutline']);
        await expect(row('evaluated').getByRole('cell').nth(1)).toHaveText('0');
        await expect(row('missing not registered').getByRole('button', { name: 'Preload missing' })).toHaveCount(0);

        await page.click('#b');
        await expect(row('log').getByRole('cell')).toHaveText(['yes', '2', '1', '0', 'PreloadOutline']);

        await page.getByRole('button', { name: 'Outline the elements of log' }).click();
        await expect(panel(page).locator('#layer .box')).toHaveCount(2);
        await expect(page.getByRole('button', { name: 'Outline the elements of log' })).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: 'Outline the elements of log' }).click();
        await expect(panel(page).locator('#layer .box')).toHaveCount(0);

        await page.getByRole('button', { name: 'Preload evaluated' }).click();
        await expect(page.locator('link[rel="modulepreload"][href$="/fixtures/actions/evaluated.js"]')).toHaveCount(1);
        await expect(row('evaluated').getByRole('cell').first()).toHaveText('fetched');
    });

    test('Runs shows each run with its status, and clicking one outlines its element', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button> <button id="e" cw-action="log#boom">boom</button>' });
        await install(page, { open: true });
        await tab(page, 'Runs').click();
        await page.click('#b');
        await expect(rows(page, 'runs')).toHaveCount(1);
        await page.click('#e');
        await expect(rows(page, 'runs')).toHaveCount(2);
        // Newest first.
        await expect(rows(page, 'runs').nth(0).getByRole('cell')).toHaveText(['log#boom', 'button#e', 'click', 'drop', /\d ms$/, 'failed: boom']);
        await expect(rows(page, 'runs').nth(1).getByRole('cell')).toHaveText(['log', 'button#b', 'click', 'drop', /\d ms$/, 'done']);

        await rows(page, 'runs').nth(1).getByRole('button').click();
        const box = panel(page).locator('#layer .box');
        await expect(box).toHaveCount(1);
        const [outlined, element] = await Promise.all([box.boundingBox(), page.locator('#b').boundingBox()]);
        for (const key of ['x', 'y', 'width', 'height']) expect(outlined[key]).toBeCloseTo(element[key], 0);
    });

    test('the Log shows the trace with the development build', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button>' });
        await install(page, { open: true });
        await tab(page, 'Log').click();
        await page.click('#b');
        const entries = panel(page).locator('#log li');
        await expect(entries.filter({ hasText: 'cw:done log button#b' })).toHaveCount(1);
        // Hovering fetched the module on the way to the click.
        await expect(entries.locator('b')).toHaveText(['preload', 'cw:run', 'start', 'import', 'imported', 'end', 'cw:done']);
        await expect(entries.filter({ hasText: 'start log drop button#b' })).toHaveCount(1);
        await expect(panel(page).locator('#untraced')).toBeHidden();

        await panel(page).locator('#filter').selectOption('end');
        await expect(entries).toHaveCount(1);
        await expect(entries).toContainText(/end log done \d/);
        await panel(page).locator('#filter').selectOption('');
        await expect(entries).toHaveCount(7);

        await page.getByRole('button', { name: 'Pause' }).click();
        await page.click('#b');
        await expectLog(page, [expect.anything(), expect.anything()]);
        await page.waitForTimeout(300);
        await expect(entries).toHaveCount(7);
        await page.getByRole('button', { name: 'Pause' }).click();
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect(entries).toHaveCount(0);
    });

    test('with the production build, the Log and Runs come from the cw:* events', async ({ page }) => {
        await boot(page, {
            build: 'esm',
            html: `<button id="b" cw-action="log">go</button> <button id="e" cw-action="log#boom">boom</button>
                   <input id="q" cw-action="log#value" cw-debounce="500">`,
        });
        await install(page, { open: true }, '/dist/esm/devtools.js');
        await tab(page, 'Log').click();
        await page.click('#b');
        await page.click('#e');
        const entries = panel(page).locator('#log li');
        await expect(entries.locator('b')).toHaveText(['cw:run', 'cw:done', 'cw:run', 'cw:error']);
        await expect(entries.nth(3)).toContainText('cw:error log#boom boom button#e');
        await expect(panel(page).locator('#untraced')).toBeVisible();
        await tab(page, 'Runs').click();
        await expect(rows(page, 'runs').locator('td:last-child')).toHaveText(['failed: boom', 'done']);
        // Each keystroke fires cw:run, but the debounce lets only the last one run.
        await page.locator('#q').pressSequentially('wire');
        await expectLog(page, expect.arrayContaining([expect.objectContaining({ fn: 'value', value: 'wire' })]));
        await expect(rows(page, 'runs').first().getByRole('cell')).toHaveText(['log#value', 'input#q', 'input', 'restart', /\d ms$/, 'done']);
        await expect(rows(page, 'runs')).toHaveCount(3);
    });

    test('Inspect picks an element without running it, and Element shows its bindings', async ({ page }) => {
        await boot(page, {
            html: `<button id="b" cw-action="log" cw-props='{"id": 42}' cw-debounce="50" cw-prevent="click"><b id="label">go</b></button>
                   <div cw-ignore><input id="i" cw-on-keydown="log#second" cw-props='{oops' cw-concurrency="latest" cw-once></div>`,
        });
        await install(page, { open: true });
        const inspect = page.getByRole('button', { name: 'Inspect' });
        await inspect.click();
        await expect(inspect).toHaveAttribute('aria-pressed', 'true');
        await page.hover('#label');
        // The bound button is outlined, not the text inside it.
        await expect(panel(page).locator('#layer .box.pick')).toHaveText('button#b');
        await page.click('#label');
        await expect(tab(page, 'Element')).toHaveAttribute('aria-selected', 'true');
        await expect(inspect).toHaveAttribute('aria-pressed', 'false');
        const details = panel(page).locator('#element');
        await expect(details.locator('dt')).toHaveText(['Element', 'Actions', 'Trigger', 'Preload', 'Props', 'Concurrency', 'Once', 'Debounce', 'Prevent', 'Pending', 'Inside cw-ignore', 'Runs']);
        await expect(details.locator('dd')).toHaveText(['button#b Outline', 'click → log (drop)', 'none', 'intent', '{\n  "id": 42\n}', 'default', 'no', '50 ms', 'click', 'no', 'no', 'none']);
        // Neither the click nor the hover reached the page: nothing ran, nothing was fetched.
        await page.waitForTimeout(200);
        expect(await log(page)).toEqual([]);
        await expect(page.locator('link[rel="modulepreload"]')).toHaveCount(0);

        // From the keyboard: focus an element, then Enter.
        await inspect.click();
        await page.focus('#i');
        await page.keyboard.press('Enter');
        await expect(details.locator('dd')).toHaveText(['input#i Outline', 'keydown → log#second (drop)', 'none', 'intent', /^Invalid JSON: /, 'latest', 'yes', 'none', 'default', 'no', 'yes', 'none']);
        // Escape leaves inspect mode first, then closes the panel.
        await inspect.click();
        await page.keyboard.press('Escape');
        await expect(inspect).toHaveAttribute('aria-pressed', 'false');
        await expect(region(page)).toBeVisible();
        await inspect.focus();
        await page.keyboard.press('Escape');
        await expect(region(page)).toBeHidden();
        await expect(page.getByRole('button', { name: 'CycleWire devtools' })).toBeFocused();
        expect(await log(page)).toEqual([]);
    });

    test('nothing is added to the page outside the panel element', async ({ page }) => {
        await boot(page, { html: '<button id="b" class="cta" style="color: red" cw-action="log">go</button>' });
        const before = await snapshot(page);
        await install(page, { open: true });
        await page.getByRole('button', { name: 'Outline the elements of log' }).click();
        await page.getByRole('button', { name: 'Inspect' }).click();
        await page.hover('#b');
        for (const name of ['Runs', 'Log', 'Triggers', 'Element', 'Actions']) await tab(page, name).click();
        expect(await snapshot(page)).toEqual(before);
        expect(await page.evaluate(() => [...document.documentElement.children].map((el) => el.localName))).toEqual(['head', 'body', 'cyclewire-devtools']);
    });

    test('devtools() works as a plugin, and sees the triggers from the start', async ({ page }) => {
        await boot(page, {
            start: false,
            html: `<button id="b" cw-action="log">go</button>
                   <div class="spacer"></div>
                   <div id="t" cw-action="log#second" cw-trigger="visible">later</div>`,
        });
        await page.evaluate(async () => {
            const { devtools } = await import('/dist/esm-dev/devtools.js');
            // shadow: true makes CycleWire observe the panel's own shadow root too.
            window.CW.start({ shadow: true, actions: { log: '/fixtures/actions/log.js' }, plugins: [devtools({ open: true })] });
        });
        await expect(region(page)).toBeVisible();
        await tab(page, 'Triggers').click();
        await expect(rows(page, 'triggers').getByRole('cell')).toHaveText(['div#t', 'trigger', 'visible', 'log#second', 'waiting']);
        // An idle panel leaves its DOM alone, even while CycleWire watches it.
        const mutations = await page.evaluate(() => new Promise((resolve) => {
            let count = 0;
            const observer = new MutationObserver((records) => (count += records.length));
            observer.observe(document.querySelector('cyclewire-devtools').shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true });
            setTimeout(() => resolve(count), 600);
        }));
        expect(mutations).toBe(0);
        await page.locator('#t').scrollIntoViewIfNeeded();
        await expect(rows(page, 'triggers').getByRole('cell').last()).toHaveText('fired');
        await tab(page, 'Runs').click();
        await expect(rows(page, 'runs').getByRole('cell')).toHaveText(['log#second', 'div#t', '–', 'drop', /\d ms$/, 'done']);
        // install() finds the panel the plugin mounted.
        await install(page);
        await expect(panel(page)).toHaveCount(1);
    });

    test('install() waits for CycleWire to start', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="b" cw-action="log">go</button>' });
        await install(page, { open: true });
        await expect(panel(page).locator('#status')).toHaveText('Waiting for CycleWire to start');
        await page.evaluate(() => window.CW.start({ actions: { log: '/fixtures/actions/log.js' } }));
        await expect(panel(page).locator('#status')).toHaveText('');
        await expect(rows(page, 'actions').getByRole('rowheader')).toHaveText(['log']);
    });

    test('an older CycleWire without registered() still shows what the page binds', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button>' });
        await page.evaluate(async () => {
            const { install } = await import('/dist/esm-dev/devtools.js');
            // 1.0.x: the same API, minus registered().
            const { registered, ...old } = window.CW;
            old.use = (plugin) => window.CW.use({ ...plugin, setup: (info) => plugin.setup({ ...info, wire: old }) });
            install({ wire: old, open: true });
        });
        await expect(rows(page, 'actions').getByRole('rowheader')).toHaveText(['log']);
        await page.click('#b');
        await expect(rows(page, 'actions').getByRole('cell')).toHaveText(['yes', '1', '1', '0', 'PreloadOutline']);
    });

    test('keeps the last 500 log entries and 200 runs', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">go</button>' });
        await install(page, { open: true });
        await page.evaluate(async () => {
            const button = document.getElementById('b');
            for (let i = 0; i < 300; i++) await window.CW.run('log', button);
        });
        await tab(page, 'Runs').click();
        await expect(rows(page, 'runs')).toHaveCount(200);
        await tab(page, 'Log').click();
        await expect(panel(page).locator('#log li')).toHaveCount(500);
    });

    test('works on a page that enforces Trusted Types and a strict style-src', async ({ page }) => {
        await page.route('**/fixtures/csp.html', (route) => route.fulfill({
            contentType: 'text/html',
            headers: { 'Content-Security-Policy': "require-trusted-types-for 'script'; script-src 'self' 'nonce-devtools'; style-src 'self'" },
            body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP</title>
                <script src="/fixtures/harness.js"></script></head>
                <body><button id="b" cw-action="log">go</button>
                <script type="module" nonce="devtools">
                    window.__violations = [];
                    document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(event.violatedDirective));
                    const { start } = await import('/dist/esm-dev/index.js');
                    const { install } = await import('/dist/esm-dev/devtools.js');
                    start({ actions: { log: '/fixtures/actions/log.js' } });
                    install({ open: true });
                    window.__ready = true;
                </script></body></html>`,
        }));
        await page.goto('/fixtures/csp.html');
        await page.waitForFunction(() => window.__ready === true);
        await expect(region(page)).toBeVisible();
        // Styled, although inline styles are refused.
        await expect(page.getByRole('button', { name: 'CycleWire devtools' })).toHaveCSS('position', 'fixed');
        await page.getByRole('button', { name: 'Outline the elements of log' }).click();
        const [outlined, element] = await Promise.all([panel(page).locator('#layer .box').boundingBox(), page.locator('#b').boundingBox()]);
        for (const key of ['x', 'y', 'width', 'height']) expect(outlined[key]).toBeCloseTo(element[key], 0);
        await page.click('#b');
        await tab(page, 'Runs').click();
        await expect(rows(page, 'runs').locator('td:last-child')).toHaveText(['done']);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });

    test('as a bookmarklet, the bundled file inspects a classic-script page with its own prefix', async ({ page }) => {
        await page.goto('/fixtures/global.html');
        await page.waitForFunction(() => window.CycleWire?.loaded().length === 1);
        await install(page, { open: true }, '/dist/devtools.min.js');
        await expect(rows(page, 'actions').getByRole('rowheader')).toHaveText(['like', 'outbound', 'widget']);
        await expect(rows(page, 'actions').locator('td:nth-child(2)')).toHaveText(['no', 'no', 'yes']);
        await expect(rows(page, 'actions').locator('td:nth-child(3)')).toHaveText(['1', '1', '1']);
        await tab(page, 'Triggers').click();
        // It fired before the panel came: a load trigger fires as soon as CycleWire sees it.
        await expect(rows(page, 'triggers').getByRole('cell')).toHaveText(['div#widget', 'trigger', 'load', 'widget', 'fired']);
        await tab(page, 'Runs').click();
        await page.click('#like');
        await expect(rows(page, 'runs').getByRole('cell')).toHaveText(['like', 'button#like', 'click', 'drop', /\d ms$/, 'done']);
    });
});
