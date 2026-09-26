import { expect, test } from '@playwright/test';
import { boot, expectLog, open } from './helpers.js';

// A plugin that records what the core tells it, as compact strings.
const record = () => {
    window.__trace = [];
    const id = (element) => element?.id || element?.localName || '';
    window.CW.use({
        trace(event) {
            const { type } = event;
            if (type === 'start') window.__trace.push(`start ${event.action} ${id(event.element)} ${event.mode}`);
            else if (type === 'end') window.__trace.push(`end ${id(event.run.el)} ${event.status}`);
            else if (type === 'import' || type === 'imported') window.__trace.push(`${type} ${event.name}`);
            else if (type === 'preload') window.__trace.push(`preload ${event.name} ${event.reason ?? ''}`.trim());
            else if (type === 'schedule') window.__trace.push(`schedule ${event.kind} ${event.when} ${id(event.element)}`);
            else window.__trace.push(`${type} ${event.action} ${id(event.element)}${event.reason ? ` ${event.reason}` : ''}`);
        },
    });
};
const trace = (page) => page.evaluate(() => window.__trace);

test.describe('trace', () => {
    test('the development build reports what it schedules, fetches, skips and runs', async ({ page }) => {
        await boot(page, {
            start: false,
            html: `<button id="b" cw-action="gated">go</button>
                   <div id="t" cw-action="log" cw-trigger="idle"></div>
                   <button id="u" cw-action="nope">nope</button>`,
        });
        await page.evaluate(record);
        await page.evaluate(() => window.CW.start({ preload: 'intent', actions: { gated: '/fixtures/actions/gated.js', log: '/fixtures/actions/log.js' } }));
        await expect.poll(() => trace(page)).toEqual(expect.arrayContaining(['schedule trigger idle t', 'start log t drop', 'import log', 'imported log', 'end t done']));

        await page.hover('#b');
        await page.click('#b');
        await expectLog(page, expect.arrayContaining([['start', 'b', 'click']]));
        // A second click while the first run is in flight is dropped.
        await page.click('#b');
        await open(page, 'b');
        await page.click('#u');
        await expect.poll(() => trace(page)).toEqual(expect.arrayContaining([
            'preload gated intent',
            'start gated b drop',
            'skip gated b busy',
            'end b done',
            'skip nope u unregistered',
        ]));
        const events = await trace(page);
        expect(events.indexOf('start gated b drop')).toBeLessThan(events.indexOf('end b done'));
    });

    test('the production build reports nothing', async ({ page }) => {
        await boot(page, { build: 'esm', start: false, html: '<button id="b" cw-action="log">go</button>' });
        await page.evaluate(record);
        await page.evaluate(() => window.CW.start({ actions: { log: '/fixtures/actions/log.js' } }));
        await page.click('#b');
        await expectLog(page, [{ fn: 'run', el: 'b', type: 'click', target: 'b', props: null }]);
        expect(await trace(page)).toEqual([]);
    });
});
