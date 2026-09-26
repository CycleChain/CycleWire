import { expect, test } from '@playwright/test';
import { boot } from './helpers.js';

const ACTIONS = { state: '/fixtures/actions/state.js', log: '/fixtures/actions/log.js' };

/** Boots with the signals plugin installed. */
async function bootSignals(page, html) {
    await boot(page, { start: false, html });
    await page.evaluate((actions) => window.CW.start({ actions, plugins: [window.CWX.signals.signals()] }), ACTIONS);
}

test.describe('cyclewire/signals', () => {
    test('nothing is rendered on load; state comes alive when touched', async ({ page }) => {
        // The server rendered "server" although the JSON says 2: proof that
        // CycleWire does not re-render on boot.
        await bootSignals(page, `
            <section cw-state='{"count": 2, "open": false}'>
                <output id="count" cw-bind="text: count">server</output>
                <div id="panel" cw-bind="show: open; attr.aria-expanded: open">panel</div>
                <button id="inc" cw-action="state#inc">+1</button>
                <button id="toggle" cw-action="state#toggle">toggle</button>
            </section>`);
        await page.waitForTimeout(150);
        await expect(page.locator('#count')).toHaveText('server');
        await expect(page.locator('#panel')).toBeVisible();

        await page.click('#inc');
        await expect(page.locator('#count')).toHaveText('3');
        await expect(page.locator('#panel')).toBeHidden();
        await expect(page.locator('#panel')).toHaveAttribute('aria-expanded', 'false');
        await page.click('#toggle');
        await expect(page.locator('#panel')).toBeVisible();
        await expect(page.locator('#panel')).toHaveAttribute('aria-expanded', 'true');
    });

    test('two-way bindings wake the scope on first input', async ({ page }) => {
        await bootSignals(page, `
            <form cw-state='{"query": "", "done": false, "color": "red", "size": 1}'>
                <input id="q" cw-bind="value: query">
                <p id="echo" cw-bind="text: query; class.empty: !query"></p>
                <input id="done" type="checkbox" cw-bind="checked: done">
                <p id="status" cw-bind="class.is-done: done">status</p>
                <input type="radio" name="c" id="red" value="red" cw-bind="value: color" checked>
                <input type="radio" name="c" id="blue" value="blue" cw-bind="value: color">
                <p id="color" cw-bind="text: color; style.color: color"></p>
                <input id="size" type="number" cw-bind="value: size">
                <p id="double" cw-bind="text: size"></p>
            </form>`);
        await page.fill('#q', 'wire');
        await expect(page.locator('#echo')).toHaveText('wire');
        await expect(page.locator('#echo')).not.toHaveClass(/empty/);
        await page.check('#done');
        await expect(page.locator('#status')).toHaveClass(/is-done/);
        await page.check('#blue');
        await expect(page.locator('#color')).toHaveText('blue');
        await expect(page.locator('#color')).toHaveCSS('color', 'rgb(0, 0, 255)');
        await page.fill('#size', '7');
        await expect(page.locator('#double')).toHaveText('7');
        expect(await page.evaluate(() => typeof window.CWX.signals.stateOf(document.getElementById('size')).size)).toBe('number');
    });

    test('named stores reach every bound element and late content binds on arrival', async ({ page }) => {
        await bootSignals(page, `
            <script type="application/json" cw-store="cart">{"items": []}</script>
            <header><span id="badge" cw-bind="text: $cart.count">0</span></header>
            <button id="add" cw-action="state#add" cw-props='{"sku": "w1", "price": 12}'>Add</button>
            <p id="total" cw-bind="text: $cart.total">0</p>
            <div id="late"></div>`);
        await page.click('#add');
        await page.click('#add');
        await expect(page.locator('#badge')).toHaveText('2');
        await expect(page.locator('#total')).toHaveText('24');
        await page.evaluate(() => {
            document.getElementById('late').innerHTML = '<span id="mini" cw-bind="text: $cart.count">?</span>';
        });
        await expect(page.locator('#mini')).toHaveText('2');
    });

    test('scopes can seed from a JSON script by id, and nested scopes stay separate', async ({ page }) => {
        await bootSignals(page, `
            <script type="application/json" id="seed">{"count": 10}</script>
            <section cw-state="#seed">
                <output id="outer" cw-bind="text: count">10</output>
                <button id="outer-inc" cw-action="state#inc">+</button>
                <div cw-state='{"count": 0}'>
                    <output id="inner" cw-bind="text: count">0</output>
                    <button id="inner-inc" cw-action="state#inc">+</button>
                </div>
            </section>`);
        await page.click('#outer-inc');
        await page.click('#inner-inc');
        await page.click('#inner-inc');
        await expect(page.locator('#outer')).toHaveText('11');
        await expect(page.locator('#inner')).toHaveText('2');
    });

    test('bindings and store seeds inside cw-ignore stay inert', async ({ page }) => {
        await bootSignals(page, `
            <div cw-ignore>
                <script type="application/json" cw-store="cart">{"items": [{"sku": "fake", "price": 999}]}</script>
                <span id="ugc" cw-bind="text: $cart.count">ugc</span>
                <input id="ugc-input" cw-bind="value: $cart.note">
            </div>
            <script type="application/json" cw-store="cart">{"items": []}</script>
            <span id="badge" cw-bind="text: $cart.count">0</span>
            <button id="add" cw-action="state#add" cw-props='{"sku": "w1", "price": 12}'>Add</button>`);
        await page.click('#add');
        // The page's own seed was used, not the injected one.
        await expect(page.locator('#badge')).toHaveText('1');
        await expect(page.locator('#ugc')).toHaveText('ugc');
        await page.fill('#ugc-input', 'hello');
        expect(await page.evaluate(() => window.CWX.signals.store('cart').note)).toBeUndefined();
    });

    test('attr bindings never write event handlers or script URLs', async ({ page }) => {
        await bootSignals(page, `
            <section cw-state='{"code": "window.__pwned = true", "url": "javascript:window.__pwned = true", "safe": "/ok"}'>
                <a id="link" href="/start" cw-bind="attr.onclick: code; attr.href: url; attr.title: safe">link</a>
                <a id="ok" cw-bind="attr.href: safe">ok</a>
            </section>`);
        await page.evaluate(() => window.CWX.signals.stateOf(document.getElementById('link')));
        await expect(page.locator('#ok')).toHaveAttribute('href', '/ok');
        await expect(page.locator('#link')).toHaveAttribute('title', '/ok');
        await expect(page.locator('#link')).toHaveAttribute('href', '/start');
        expect(await page.locator('#link').getAttribute('onclick')).toBeNull();
        const warned = await page.evaluate(() => window.__warnings);
        expect(warned.some((line) => line.includes('Refusing to bind onclick'))).toBe(true);
        expect(warned.some((line) => line.includes('Refusing to bind href'))).toBe(true);
    });

    test('bindings stop following elements removed from the page', async ({ page }) => {
        await bootSignals(page, `
            <section id="s" cw-state='{"count": 0}'>
                <output id="o" cw-bind="text: count">0</output>
                <button id="inc" cw-action="state#inc">+</button>
            </section>`);
        await page.click('#inc');
        await expect(page.locator('#o')).toHaveText('1');
        const detached = await page.evaluate(async () => {
            const output = document.getElementById('o');
            output.remove();
            window.CWX.signals.stateOf(document.getElementById('inc')).count = 5;
            window.CWX.signals.stateOf(document.getElementById('inc')).count = 6;
            return output.textContent;
        });
        // The first write after removal is the effect's last; it disposes itself.
        expect(detached).toBe('1');
    });
});
