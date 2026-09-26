import { expect, test } from '@playwright/test';
import { boot, warnings } from './helpers.js';

// cyclewire/stream against the test server's Server-Sent Events channels.
// Each test gets its own channel: the server is shared by every browser.
const channelFor = (info, name) => `${name}-${info.project.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const stats = async (page, channel) => (await page.request.get(`/sse/stats?channel=${channel}`)).json();
/** One SSE event: every line of the data gets its own `data:` field. */
const event = (data, id) => `${id ? `id: ${id}\n` : ''}${data.split('\n').map((line) => `data: ${line}`).join('\n')}\n\n`;
const sendTo = (page, channel, body) => page.request.post(`/sse/send?channel=${channel}`, { data: body, headers: { 'content-type': 'text/plain' } });

test.describe('apply()', () => {
    test('every operation, by id or by selector', async ({ page }) => {
        await boot(page, {
            html: `<ul id="list"><li>a</li></ul><p class="many">1</p><p class="many">2</p>
                   <div id="gone">x</div><div id="mid">mid</div><div id="old">old</div>`,
        });
        await page.evaluate(() => window.CWX.stream.apply(window.CWX.dom.html.raw(`
            <cw-stream op="append" target="list"><template><li>b</li></template></cw-stream>
            <cw-stream op="prepend" target="list"><template><li>z</li></template></cw-stream>
            <cw-stream op="inner" targets=".many"><template><b>n</b></template></cw-stream>
            <cw-stream op="remove" target="gone"></cw-stream>
            <cw-stream op="before" target="mid"><template><i id="b4">before</i></template></cw-stream>
            <cw-stream op="after" target="mid"><template><i id="af">after</i></template></cw-stream>
            <cw-stream op="outer" target="old"><template><section id="new">new</section></template></cw-stream>`)));
        expect(await page.locator('#list li').allTextContents()).toEqual(['z', 'a', 'b']);
        expect(await page.locator('.many').evaluateAll((items) => items.map((item) => item.innerHTML))).toEqual(['<b>n</b>', '<b>n</b>']);
        await expect(page.locator('#gone')).toHaveCount(0);
        expect(await page.locator('#app').evaluate((app) => [...app.querySelectorAll('#b4, #mid, #af')].map((el) => el.id))).toEqual(['b4', 'mid', 'af']);
        await expect(page.locator('#old')).toHaveCount(0);
        await expect(page.locator('#new')).toHaveText('new');
    });

    test('morph keeps what the user typed, and the element itself when the markup is for it', async ({ page }) => {
        await boot(page, { html: '<form id="form" class="a"><input id="name"><span id="hint">old</span></form>' });
        await page.fill('#name', 'typed');
        await page.evaluate(() => window.CWX.stream.apply(window.CWX.dom.html.raw(
            '<cw-stream op="morph" target="form"><template><form id="form" class="b"><input id="name"><span id="hint">new</span></form></template></cw-stream>',
        )));
        await expect(page.locator('#hint')).toHaveText('new');
        await expect(page.locator('#form')).toHaveClass('b');
        await expect(page.locator('#name')).toHaveValue('typed');
        await expect(page.locator('#form form')).toHaveCount(0);
    });

    test('only trusted markup is applied: plain strings are refused, and scripts in it never run', async ({ page }) => {
        await boot(page, { html: '<div id="box"></div>' });
        const refused = await page.evaluate(() => {
            try {
                window.CWX.stream.apply('<cw-stream op="inner" target="box"><template>x</template></cw-stream>');
                return false;
            } catch (error) {
                return error instanceof TypeError;
            }
        });
        expect(refused).toBe(true);
        await page.evaluate(() => window.CWX.stream.apply(window.CWX.dom.html.raw(
            '<cw-stream op="inner" target="box"><template><script>window.__ran = true</script><b>content</b></template></cw-stream>',
        )));
        await expect(page.locator('#box b')).toHaveText('content');
        expect(await page.evaluate(() => window.__ran)).toBeUndefined();
    });

    test('a <cw-stream> that reaches the page any other way does nothing', async ({ page }) => {
        await boot(page, { html: '<div id="box">kept</div>' });
        await page.evaluate(() => document.getElementById('app').insertAdjacentHTML('beforeend', '<cw-stream op="remove" target="box"></cw-stream>'));
        await page.waitForTimeout(100);
        await expect(page.locator('#box')).toHaveText('kept');
    });

    test('cw:stream can skip a message or change its content', async ({ page }) => {
        await boot(page, { html: '<div id="a">a</div><div id="b">b</div>' });
        await page.evaluate(async () => {
            document.addEventListener('cw:stream', (event) => {
                if (event.detail.targets[0].id === 'a') event.preventDefault();
                else event.detail.content.firstElementChild.textContent += '!';
            });
            await window.CWX.stream.apply(window.CWX.dom.html.raw(
                '<cw-stream op="inner" target="a"><template><i>A</i></template></cw-stream><cw-stream op="inner" target="b"><template><i>B</i></template></cw-stream>',
            ));
        });
        await expect(page.locator('#a')).toHaveText('a');
        await expect(page.locator('#b')).toHaveText('B!');
    });

    test('the development build names what it cannot apply', async ({ page }) => {
        await boot(page, { html: '<div id="a"></div>' });
        await page.evaluate(() => window.CWX.stream.apply(window.CWX.dom.html.raw('<cw-stream op="explode" target="a"></cw-stream><cw-stream op="inner" target="nope"></cw-stream>')));
        const said = await warnings(page);
        expect(said.some((text) => text.includes('op="explode"'))).toBe(true);
        expect(said.some((text) => text.includes('no element with id "nope"'))).toBe(true);
    });
});

test.describe('connect()', () => {
    test('subscribers to one URL share a connection that closes with the last of them', async ({ page }, info) => {
        const channel = channelFor(info, 'share');
        await boot(page, { html: '<ul id="feed"></ul><div id="status"></div>' });
        await page.evaluate((url) => {
            window.__first = window.CWX.stream.connect(url, { element: document.getElementById('status') });
            window.__second = window.CWX.stream.connect(url);
        }, `/sse/listen?channel=${channel}`);
        await expect.poll(() => stats(page, channel)).toMatchObject({ open: 1, connects: 1 });
        await expect(page.locator('#status')).toHaveAttribute('cw-stream-state', 'open');

        await sendTo(page, channel, event('<cw-stream op="append" target="feed"><template><li>one</li></template></cw-stream>\n<cw-stream op="append" target="feed"><template><li>two</li></template></cw-stream>'));
        await expect(page.locator('#feed li')).toHaveText(['one', 'two']);

        await page.evaluate(() => window.__first());
        await expect(page.locator('#status')).toHaveAttribute('cw-stream-state', 'closed');
        expect((await stats(page, channel)).open).toBe(1);
        await page.evaluate(() => window.__second());
        await expect.poll(async () => (await stats(page, channel)).open).toBe(0);
    });

    test('a dropped connection comes back and says where it left off', async ({ page }, info) => {
        const channel = channelFor(info, 'resume');
        await boot(page, { html: '<ul id="feed"></ul>' });
        await page.evaluate((url) => window.CWX.stream.connect(url), `/sse/listen?channel=${channel}`);
        await expect.poll(async () => (await stats(page, channel)).open).toBe(1);
        await sendTo(page, channel, event('<cw-stream op="append" target="feed"><template><li>7</li></template></cw-stream>', '7'));
        await expect(page.locator('#feed li')).toHaveText(['7']);
        await page.request.post(`/sse/drop?channel=${channel}`);
        await expect.poll(() => stats(page, channel), { timeout: 10_000 }).toMatchObject({ open: 1, connects: 2, lastEventId: '7' });
    });

    test('after the server refuses, it reconnects with a growing delay', async ({ page }, info) => {
        const channel = channelFor(info, 'backoff');
        await boot(page, { html: '<div id="status"></div>' });
        await page.evaluate((url) => window.CWX.stream.connect(url, { element: document.getElementById('status') }), `/sse/fail?channel=${channel}&times=2`);
        await expect(page.locator('#status')).toHaveAttribute('cw-stream-state', 'connecting');
        await expect(page.locator('#status')).toHaveAttribute('cw-stream-state', 'open', { timeout: 15_000 });
        expect((await stats(page, channel)).connects).toBe(1);
    });

    test('an element that leaves the page closes its subscription', async ({ page }, info) => {
        const channel = channelFor(info, 'leave');
        await boot(page, { html: '<div id="widget"></div>' });
        await page.evaluate((url) => window.CWX.stream.connect(url, { element: document.getElementById('widget') }), `/sse/listen?channel=${channel}`);
        await expect.poll(async () => (await stats(page, channel)).open).toBe(1);
        await page.evaluate(() => document.getElementById('widget').remove());
        await expect.poll(async () => (await stats(page, channel)).open).toBe(0);
    });

    test('an aborted signal closes the subscription', async ({ page }, info) => {
        const channel = channelFor(info, 'signal');
        await boot(page, { html: '' });
        await page.evaluate((url) => {
            window.__controller = new AbortController();
            window.CWX.stream.connect(url, { signal: window.__controller.signal });
        }, `/sse/listen?channel=${channel}`);
        await expect.poll(async () => (await stats(page, channel)).open).toBe(1);
        await page.evaluate(() => window.__controller.abort());
        await expect.poll(async () => (await stats(page, channel)).open).toBe(0);
    });
});

test.describe('streams() plugin', () => {
    test('cw-stream opens only the channels it lists, on the same origin', async ({ page }, info) => {
        const channel = channelFor(info, 'plugin');
        await boot(page, {
            start: false,
            html: `<ul id="feed" cw-stream="feed"></ul>
                   <div cw-stream="unknown"></div>
                   <div cw-stream="elsewhere"></div>
                   <div cw-ignore><div cw-stream="feed"></div></div>`,
        });
        await page.evaluate((url) => {
            const { streams } = window.CWX.stream;
            window.CW.start({ plugins: [streams({ channels: { feed: url, elsewhere: 'https://example.com/events' } })] });
        }, `/sse/listen?channel=${channel}`);
        await expect(page.locator('#feed')).toHaveAttribute('cw-stream-state', 'open');
        expect(await stats(page, channel)).toMatchObject({ open: 1, connects: 1 });
        await sendTo(page, channel, event('<cw-stream op="append" target="feed"><template><li>hi</li></template></cw-stream>'));
        await expect(page.locator('#feed li')).toHaveText(['hi']);
        const said = await warnings(page);
        expect(said.some((text) => text.includes('No stream channel is named "unknown"'))).toBe(true);
        expect(said.some((text) => text.includes('"elsewhere" points to another origin'))).toBe(true);
        // Content added later is scanned too.
        await page.evaluate(() => document.getElementById('app').insertAdjacentHTML('beforeend', '<div id="late" cw-stream="feed"></div>'));
        await expect(page.locator('#late')).toHaveAttribute('cw-stream-state', 'open');
        expect((await stats(page, channel)).connects).toBe(1);
    });
});
