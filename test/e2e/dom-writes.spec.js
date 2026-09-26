import { expect, test } from '@playwright/test';
import { boot, log, open, waitForLog } from './helpers.js';

// Server-rendered markup that a framework may hydrate must not change behind
// its back. CycleWire only ever toggles its pending state while a run is in
// flight, and puts back whatever was there before.
test('CycleWire only toggles pending state, and leaves the markup as it found it', async ({ page }) => {
    await boot(page, {
        start: false,
        html: `<button id="b" cw-action="gated" aria-busy="false">go</button>
               <div id="t" cw-action="log" cw-trigger="load"></div>
               <div id="v" cw-action="log" cw-trigger="visible"></div>
               <button id="stale" cw-action="log" cw-pending>server-rendered pending</button>`,
    });
    const before = await page.evaluate(() => {
        window.__mutations = [];
        new MutationObserver((records) => {
            for (const record of records) window.__mutations.push(record.type === 'attributes' ? record.attributeName : record.type);
        }).observe(document.getElementById('app'), { attributes: true, childList: true, subtree: true });
        const html = document.getElementById('app').innerHTML;
        window.CW.start({ actions: { log: '/fixtures/actions/log.js', gated: '/fixtures/actions/gated.js' } });
        return html;
    });
    await expect.poll(async () => (await log(page)).length).toBe(2);

    // A server-rendered cw-pending does not block the element (it used to).
    await page.click('#stale');
    await expect.poll(async () => (await log(page)).length).toBe(3);

    await page.click('#b');
    await waitForLog(page, '"start"');
    await expect(page.locator('#b')).toHaveAttribute('aria-busy', 'true');
    await open(page, 'b');
    await waitForLog(page, '"end"');

    await expect.poll(() => page.evaluate(() => document.getElementById('app').innerHTML)).toBe(before);
    const touched = new Set(await page.evaluate(() => window.__mutations));
    expect([...touched].sort()).toEqual(['aria-busy', 'cw-pending']);
});
