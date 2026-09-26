import { expect, test } from '@playwright/test';
import { boot, expectLog, log, warnings } from './helpers.js';

test.describe('delegation', () => {
    test('handlers receive one context object', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log#context">go</button>' });
        await page.click('#b');
        await expectLog(page, [{ fn: 'context', keys: ['action', 'element', 'event', 'props', 'signal', 'target', 'wire'], aborted: false, isWire: true }]);
    });

    test('cw-props reaches the handler as parsed JSON', async ({ page }) => {
        await boot(page, { html: `<button id="b" cw-action="log" cw-props='{"id": 42, "tags": ["a"]}'>go</button>` });
        await page.click('#b');
        await expectLog(page, [{ fn: 'run', el: 'b', type: 'click', target: 'b', props: { id: 42, tags: ['a'] } }]);
    });

    test('the innermost bound element wins and the target is captured', async ({ page }) => {
        await boot(page, {
            html: '<div id="card" cw-action="log#second" tabindex="0"><button id="inner" cw-action="log"><b id="label">go</b></button></div>',
        });
        await page.click('#label');
        await expectLog(page, [{ fn: 'run', el: 'inner', type: 'click', target: 'label', props: null }]);
    });

    test('cw-on-<event> binds any delegated event, alongside the shorthand', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log" cw-on-keydown="log#second">go</button>' });
        await page.focus('#b');
        await page.keyboard.press('KeyA');
        await page.click('#b');
        await expect.poll(async () => (await log(page)).map((entry) => `${entry.fn}:${entry.type}`)).toEqual(['second:keydown', 'run:click']);
    });

    test('listen() delegates extra event types', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-on-dblclick="log">go</button>' });
        await page.dblclick('#b');
        await page.waitForTimeout(100);
        expect(await log(page)).toEqual([]);
        await page.evaluate(() => window.CW.listen(['dblclick']));
        await page.dblclick('#b');
        await expect.poll(async () => (await log(page)).map((entry) => entry.type)).toEqual(['dblclick']);
    });

    test('a handler that stops propagation below the document hides the event, unless CycleWire captures', async ({ page }) => {
        // Where React (root container), Vue (the element) and Svelte (mount target) handle events.
        const html = '<div id="island"><button id="b" cw-action="log">go</button></div>';
        const stopInside = () => document.getElementById('island').addEventListener('click', (event) => {
            window.__log.push({ fn: 'island' });
            event.stopPropagation();
        });
        await boot(page, { html });
        await page.evaluate(stopInside);
        await page.click('#b');
        await page.waitForTimeout(100);
        expect(await log(page)).toEqual([{ fn: 'island' }]);

        await boot(page, { html, options: { capture: true } });
        await page.evaluate(stopInside);
        await page.click('#b');
        await expect.poll(async () => (await log(page)).map((entry) => entry.fn)).toEqual(['island', 'run']);
    });

    test('links are never prevented unless asked, so they still navigate', async ({ page }) => {
        await boot(page, { html: '<a id="a" href="/fixtures/?build=esm-dev#next" cw-action="log">next</a>' });
        const clicked = page.waitForURL(/#next$/);
        await page.click('#a');
        await clicked;
    });

    test('target=_blank links open and still run their action', async ({ page, context }) => {
        await boot(page, { html: '<a id="a" href="/fixtures/index.html#popup" target="_blank" cw-action="log">site</a>' });
        const popup = context.waitForEvent('page');
        await page.click('#a');
        expect((await popup).url()).toContain('#popup');
        await expectLog(page, [{ fn: 'run', el: 'a', type: 'click', target: 'a', props: null }]);
    });

    test('href="#" links are prevented', async ({ page }) => {
        await boot(page, { html: '<a id="a" href="#" cw-action="log">menu</a>' });
        const before = page.url();
        await page.click('#a');
        await expectLog(page, [{ fn: 'run', el: 'a', type: 'click', target: 'a', props: null }]);
        expect(page.url()).toBe(before);
    });

    test('a prevented link still opens in a new tab on modified clicks, without running', async ({ page, context }) => {
        await boot(page, { html: '<a id="a" href="/fixtures/index.html#tab" cw-action="log" cw-prevent>tab</a>' });
        const opened = context.waitForEvent('page');
        await page.click('#a', { modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
        expect((await opened).url()).toContain('#tab');
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
    });

    test('cw-ignore stops the search and disabled elements swallow events', async ({ page }) => {
        await boot(page, {
            html: `<div cw-action="log#second" id="outer" tabindex="0">
                     <div cw-ignore><span id="ugc">user content</span></div>
                     <span id="plain">plain</span>
                     <button id="off" cw-action="log" disabled>off</button>
                     <span id="aria" role="button" tabindex="0" cw-action="log" aria-disabled="true">aria</span>
                   </div>`,
        });
        await page.click('#ugc');
        await page.click('#aria', { force: true });
        await page.click('#off', { force: true });
        await page.click('#plain');
        await expectLog(page, [{ fn: 'second', el: 'outer', type: 'click', target: 'plain' }]);
    });

    test('nothing inside cw-ignore binds, even an element with its own action', async ({ page }) => {
        // Injected user content: its own bindings must stay inert.
        await boot(page, {
            html: `<article cw-ignore>
                     <button id="injected" cw-action="log">injected</button>
                     <details id="d" cw-action="log#second"><summary id="s">more</summary>hidden</details>
                   </article>
                   <button id="real" cw-action="log">real</button>`,
        });
        await page.click('#injected');
        await page.click('#s');
        await expect(page.locator('#d')).toHaveAttribute('open', '');
        await page.click('#real');
        await expectLog(page, [{ fn: 'run', el: 'real', type: 'click', target: 'real', props: null }]);
    });

    test('an unregistered name is left to the browser, with a development warning', async ({ page }) => {
        await boot(page, { html: '<a id="a" href="#later" cw-action="nope">x</a>' });
        await page.click('#a');
        await expect.poll(() => page.url()).toContain('#later');
        expect((await warnings(page)).some((w) => w.includes('No action registered as "nope"'))).toBe(true);
    });

    test('cancelling cw:run lets the browser default through', async ({ page }) => {
        await boot(page, { html: '<a id="a" href="#" cw-action="log">x</a>' });
        await page.evaluate(() => document.addEventListener('cw:run', (event) => event.preventDefault()));
        await page.click('#a');
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
    });

    test('cw:done and cw:error bubble to the document; onError replaces console.error', async ({ page }) => {
        await boot(page, { start: false, html: '<button id="ok" cw-action="log">ok</button><button id="bad" cw-action="log#boom">bad</button>' });
        await page.evaluate(() => {
            window.__events = [];
            document.addEventListener('cw:done', (e) => window.__events.push(['done', e.detail.action, e.detail.result]));
            document.addEventListener('cw:error', (e) => window.__events.push(['error', e.detail.action, e.detail.error.message]));
            window.CW.start({
                actions: { log: '/fixtures/actions/log.js' },
                onError: (error, info) => window.__events.push(['onError', info.action, info.element.id, error.message]),
            });
        });
        await page.click('#ok');
        await page.click('#bad');
        await expect.poll(() => page.evaluate(() => window.__events)).toEqual([
            ['done', 'log', 'ran'],
            ['error', 'log#boom', 'boom'],
            ['onError', 'log#boom', 'bad', 'boom'],
        ]);
    });

    test('handlers with positional parameters draw a development warning', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log#positional">x</button>' });
        await page.click('#b');
        await expectLog(page, [{ fn: 'positional', event: 'object', element: 'undefined' }]);
        expect((await warnings(page)).some((w) => w.includes('declares 2 parameters'))).toBe(true);
    });

    test('run() uses the same pipeline and returns the handler result', async ({ page }) => {
        await boot(page, { html: '<div id="d"></div>' });
        const result = await page.evaluate(() => window.CW.run('log', document.getElementById('d')));
        expect(result).toBe('ran');
        await expect(page.evaluate(() => window.CW.run('missing'))).rejects.toThrow(/not registered/);
    });

    test('stop() removes every listener and start() brings them back', async ({ page }) => {
        await boot(page, { html: '<button id="b" cw-action="log">x</button>' });
        await page.evaluate(() => window.CW.stop());
        await page.click('#b');
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
        await page.evaluate(() => window.CW.start());
        await page.click('#b');
        await expect.poll(async () => (await log(page)).length).toBe(1);
    });

    test('the <details> shorthand runs on toggle, a non-bubbling event', async ({ page }) => {
        await boot(page, { html: '<details id="d" cw-action="log"><summary id="s">more</summary>body</details>' });
        await page.click('#s');
        await expect.poll(async () => (await log(page)).map((entry) => `${entry.el}:${entry.type}`)).toEqual(['d:toggle']);
    });

    test('Invoker Commands: cw-on-command receives custom --commands', async ({ page }) => {
        await boot(page, {
            html: `<button id="invoker" commandfor="panel" command="--refresh">refresh</button>
                   <div id="panel" cw-on-command="log#command"></div>`,
        });
        const supported = await page.evaluate(() => 'command' in HTMLButtonElement.prototype);
        test.skip(!supported, 'Invoker Commands are not supported in this browser build');
        await page.click('#invoker');
        await expectLog(page, [{ fn: 'command', el: 'panel', type: 'command', target: 'panel', command: '--refresh', source: 'invoker' }]);
    });
});
