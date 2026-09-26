import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { LIBRARIES } from '../morph/adapters.js';
import { CASES } from '../morph/cases.js';
import { OPERATIONS, ROWS, listMarkup, rows } from '../morph/rows.js';
import { startServer } from '../morph/server.js';

const ids = (/** @type {string} */ markup) => [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);

test('the operations produce the rows they say', () => {
    assert.equal(new Set(OPERATIONS.map((operation) => operation.id)).size, OPERATIONS.length);
    assert.deepEqual(rows(3), rows(3));
    const byId = Object.fromEntries(OPERATIONS.map((operation) => [operation.id, ids(operation.to())]));
    const initial = Array.from({ length: ROWS }, (_, i) => `row-${i + 1}`);
    assert.deepEqual(byId['reverse'], initial.slice().reverse());
    assert.deepEqual(byId['remove-every-other'], initial.filter((_, i) => i % 2 === 0));
    assert.deepEqual(byId['prepend-row'], [`row-${ROWS + 1}`, ...initial]);
    assert.deepEqual([byId['swap-rows'][1], byId['swap-rows'][998]], ['row-999', 'row-2']);
    assert.deepEqual(byId['update-every-10th'], initial);
    assert.equal((OPERATIONS[0].to().match(/ !!!/g) ?? []).length, ROWS / 10);
    assert.ok(byId['replace-structure'].every((id) => id.startsWith('card-')));
    // Every row stays unless the operation removes it or replaces them all.
    for (const operation of OPERATIONS) for (const id of operation.kept()) assert.ok(byId[operation.id].includes(id), `${operation.id} keeps ${id}`);
    assert.equal(listMarkup(rows(2)).split('\n').length, 2);
});

test('every case says what a person would want, and why', () => {
    assert.equal(new Set(CASES.map((entry) => entry.id)).size, CASES.length);
    for (const entry of CASES) assert.ok(entry.title && entry.want && entry.why && entry.before && entry.after, entry.id);
});

/** Chromium, or null when it is not installed (the micro job installs it). */
async function launch() {
    try {
        return await chromium.launch({ channel: process.env.MICRO_CHANNEL || 'chromium' });
    } catch {
        return null;
    }
}

test('the three libraries agree where they agree by design, in Chromium', async (t) => {
    const browser = await launch();
    if (!browser) return t.skip('Chromium is not installed (npx playwright install chromium, or MICRO_CHANNEL=chrome)');
    const server = await startServer();
    try {
        for (const library of LIBRARIES) {
            const page = await browser.newPage();
            const open = async () => {
                await page.goto(`${server.url}/?lib=${library.id}`);
                await page.waitForFunction(() => /** @type {any} */ (globalThis).micro?.ready === true);
            };
            for (const id of ['markup', 'keyed-reorder', 'attributes', 'text', 'svg', 'scroll', 'custom-element']) {
                await open();
                const result = await page.evaluate((caseId) => /** @type {any} */ (globalThis).micro.runCase(caseId), id);
                assert.deepEqual(result, { pass: true, problems: [] }, `${library.id}: ${id}`);
            }
            await open();
            const swap = await page.evaluate(() => /** @type {any} */ (globalThis).micro.sample('swap-rows'));
            assert.equal(swap.ok, true, `${library.id}: ${swap.problem}`);
            assert.equal(swap.kept, ROWS, library.id);
            assert.ok(swap.ms > 0 && swap.withLayout >= swap.ms, library.id);
            const counted = await page.evaluate(() => /** @type {any} */ (globalThis).micro.mutations('update-every-10th'));
            // Text changes in place: one record per changed label, and no element added or removed.
            assert.deepEqual([counted.ok, counted.records, counted.characterData, counted.added, counted.removed], [true, ROWS / 10, ROWS / 10, 0, 0], library.id);
            await page.close();
        }
    } finally {
        await browser.close();
        await server.close();
    }
});

test('the server serves the page cross-origin isolated, and nothing outside bench/ or the libraries', async () => {
    const server = await startServer();
    try {
        const page = await fetch(`${server.url}/`);
        assert.equal(page.status, 200);
        assert.equal(page.headers.get('cross-origin-embedder-policy'), 'require-corp');
        assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
        assert.equal((await fetch(`${server.url}/lib/morphdom/morphdom-esm.js`)).status, 200);
        assert.equal((await fetch(`${server.url}/lib/cyclewire/morph.js`)).status, 200);
        assert.equal((await fetch(`${server.url}/lib/idiomorph/idiomorph.esm.js`)).status, 200);
        assert.equal((await fetch(`${server.url}/bench/micro/morph/page.js`)).status, 200);
        assert.equal((await fetch(`${server.url}/bench/micro/package.json`)).status, 404);
        // Scripts that exist, reached by escaping the served folders.
        assert.equal((await fetch(`${server.url}/bench/..%2fscripts%2fbuild.js`)).status, 404);
        assert.equal((await fetch(`${server.url}/lib/cyclewire/..%2f..%2fscripts%2fbuild.js`)).status, 404);
        assert.equal((await fetch(`${server.url}/bench/micro/node_modules/morphdom/package.json`)).status, 404);
    } finally {
        await server.close();
    }
});
