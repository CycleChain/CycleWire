#!/usr/bin/env node
/**
 * Writes scenario/golden.json: the visible text of the reference page in each
 * state a journey ends in, read from the `static` app in a real browser, plus
 * the image attributes of the first screen. Conformance compares every stack
 * against it. Run it after changing the scenario, and commit the result.
 *
 *   node scripts/golden.js [--channel=chrome]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { certificate } from '../proxy/cert.js';
import { launch } from '../runner/browser.js';
import { EXPECTED, JOURNEYS } from '../runner/journeys.js';
import { open, settle } from '../runner/measure.js';
import { PROFILES } from '../runner/profiles.js';
import { load, prepare, start } from '../runner/stacks.js';
import { ensureImages } from '../scenario/images.js';

const { values: args } = parseArgs({ options: { channel: { type: 'string' } } });
const OUT = fileURLToPath(new URL('../scenario/golden.json', import.meta.url));

await ensureImages();
const { spki } = certificate();
const stack = load('static');
await prepare(stack);
const servers = await start([stack]);
const browser = await launch({ spki, channel: args.channel });
try {
    const states = {};
    for (const [name, state] of [['initial', { url: '/' }], ...JOURNEYS.map((journey) => [journey, EXPECTED[journey].state])]) {
        const session = await open({ browser, profile: PROFILES.mobile, throttle: false });
        try {
            const url = new URL(state.url, stack.url);
            if (state.cart) await session.context.addCookies([{ name: 'cart', value: encodeURIComponent(JSON.stringify(state.cart)), url: url.origin }]);
            await session.page.goto(url.href, { waitUntil: 'load' });
            await settle(session);
            const texts = await session.page.evaluate(() => window.__bench.texts());
            states[name] = { url: state.url, ...(state.cart ? { cart: state.cart } : {}), ...texts };
            if (name === 'initial') states[name].images = await session.page.evaluate(() => window.__bench.images());
        } finally {
            await session.close();
        }
    }
    await writeFile(OUT, `${JSON.stringify({ version: 1, states }, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(states).length} states to ${OUT}`);
} finally {
    await browser.close();
    await servers.stop();
}
