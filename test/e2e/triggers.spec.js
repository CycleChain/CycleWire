import { expect, test } from '@playwright/test';
import { boot, expectLog, log } from './helpers.js';

const entries = async (page) => (await log(page)).map((entry) => `${entry.fn}:${entry.el}`);

test.describe('triggers', () => {
    test('load runs at start, idle after the page settles', async ({ page }) => {
        await boot(page, {
            html: `<div id="now" cw-action="log" cw-trigger="load"></div>
                   <div id="later" cw-action="log#second" cw-trigger="idle"></div>`,
        });
        await expect.poll(() => entries(page)).toEqual(['run:now', 'second:later']);
    });

    test('one idle callback serves every idle trigger and preload', async ({ page }) => {
        await boot(page, { start: false, html: [1, 2, 3].map((n) => `<div id="t${n}" cw-action="log" cw-trigger="idle"></div><button cw-action="evaluated" cw-preload="idle">p${n}</button>`).join('') });
        await page.evaluate(() => {
            window.__idle = 0;
            window.requestIdleCallback = (callback) => {
                window.__idle++;
                return setTimeout(callback, 0);
            };
            window.CW.start({ actions: { log: '/fixtures/actions/log.js', evaluated: '/fixtures/actions/evaluated.js' } });
        });
        await expect.poll(() => entries(page)).toEqual(['run:t1', 'run:t2', 'run:t3']);
        await expect(page.locator('link[rel="modulepreload"]')).toHaveCount(1);
        expect(await page.evaluate(() => window.__idle)).toBe(1);
    });

    test('visible runs when the element approaches the viewport, once', async ({ page }) => {
        await boot(page, { html: '<div class="spacer"></div><div id="v" cw-action="log" cw-trigger="visible">below</div>' });
        await page.waitForTimeout(200);
        expect(await log(page)).toEqual([]);
        await page.locator('#v').scrollIntoViewIfNeeded();
        await expect.poll(() => entries(page)).toEqual(['run:v']);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('#v').scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        expect(await entries(page)).toEqual(['run:v']);
    });

    test('media runs once the query matches', async ({ page }) => {
        await page.setViewportSize({ width: 500, height: 700 });
        await boot(page, { html: '<div id="m" cw-action="log" cw-trigger="media:(min-width: 800px)"></div>' });
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
        await page.setViewportSize({ width: 900, height: 700 });
        await expect.poll(() => entries(page)).toEqual(['run:m']);
    });

    test('clicks inside a trigger element do not re-run it', async ({ page }) => {
        await boot(page, { html: '<div id="w" cw-action="log" cw-trigger="load"><button id="inside">inside</button></div>' });
        await expect.poll(() => entries(page)).toEqual(['run:w']);
        await page.click('#inside');
        await page.waitForTimeout(150);
        expect(await entries(page)).toEqual(['run:w']);
    });

    test('content added later is activated; moved nodes do not run again', async ({ page }) => {
        await boot(page, { html: '<section id="a"></section><section id="b"></section>' });
        await page.evaluate(() => {
            document.getElementById('a').innerHTML = '<div id="late" cw-action="log" cw-trigger="load"></div>';
        });
        await expect.poll(() => entries(page)).toEqual(['run:late']);
        await page.evaluate(() => document.getElementById('b').append(document.getElementById('late')));
        await page.waitForTimeout(150);
        expect(await entries(page)).toEqual(['run:late']);
    });

    test('a trigger waits for its action to be registered', async ({ page }) => {
        await boot(page, { actions: {}, html: '<div id="t" cw-action="log" cw-trigger="load"></div>' });
        await page.waitForTimeout(100);
        expect(await log(page)).toEqual([]);
        await page.evaluate(() => window.CW.register({ log: '/fixtures/actions/log.js' }));
        await expect.poll(() => entries(page)).toEqual(['run:t']);
    });

    test('nothing speculative runs while the page is being prerendered', async ({ page }) => {
        await boot(page, { start: false, html: '<div id="p" cw-action="log" cw-trigger="load"></div>' });
        await page.evaluate(() => {
            Object.defineProperty(document, 'prerendering', { value: true, configurable: true });
            window.CW.start({ actions: { log: '/fixtures/actions/log.js' } });
        });
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
        await page.evaluate(() => {
            Object.defineProperty(document, 'prerendering', { value: false, configurable: true });
            document.dispatchEvent(new Event('prerenderingchange'));
        });
        await expect.poll(() => entries(page)).toEqual(['run:p']);
    });

    test('triggers and scheduled preloads inside cw-ignore never activate', async ({ page }) => {
        await boot(page, {
            html: `<div cw-ignore>
                     <div id="t1" cw-action="log" cw-trigger="load"></div>
                     <div id="t2" cw-action="log" cw-trigger="visible"></div>
                     <div id="p1" cw-action="evaluated" cw-preload="load"></div>
                     <div id="host"></div>
                   </div>
                   <div id="ok" cw-action="log#second" cw-trigger="load"></div>`,
        });
        await page.evaluate(() => {
            // A shadow root inside ignored content is ignored too.
            const root = document.getElementById('host').attachShadow({ mode: 'open' });
            root.innerHTML = '<div id="inner" cw-action="log" cw-trigger="load"></div>';
            window.CW.observe(root);
        });
        await expect.poll(() => entries(page)).toEqual(['second:ok']);
        await page.waitForTimeout(300);
        expect(await entries(page)).toEqual(['second:ok']);
        expect(await page.locator('link[rel="modulepreload"]').count()).toBe(0);
    });

    test('scan() activates a subtree when mutation watching is off', async ({ page }) => {
        await boot(page, { options: { mutations: false }, html: '<section id="s"></section>' });
        await page.evaluate(() => {
            document.getElementById('s').innerHTML = '<div id="x" cw-action="log" cw-trigger="load"></div>';
        });
        await page.waitForTimeout(150);
        expect(await log(page)).toEqual([]);
        await page.evaluate(() => window.CW.scan(document.getElementById('x')));
        await expectLog(page, [{ fn: 'run', el: 'x', type: null, target: 'x', props: null }]);
    });
});
