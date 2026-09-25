import { expect, test } from '@playwright/test';
import { boot } from './helpers.js';

// A differential test of html's context analysis against real HTML parsers.
// Random templates (test/fixtures/fuzz.js) are filled with values carrying a
// unique marker and parsed by the browser. Wherever html agrees to render, each
// marker must appear exactly once, and only in a text node outside raw-text
// elements or in an attribute value that is not an event handler or srcdoc.
// FUZZ_SEED replays a run.
const SEED = Number(process.env.FUZZ_SEED) || Math.floor(Date.now() / 864e5);
const RUNS = 300;

test('html only renders interpolations where the browser parses them as text or a safe attribute value', async ({ page }) => {
    await boot(page, { start: false });
    const report = await page.evaluate(async ({ seed, runs }) => {
        const { prng, adversarial, template, RAW_TEXT } = await import('/fixtures/fuzz.js');
        const { html, fragment } = window.CWX.dom;
        const random = prng(seed);
        const failures = [];
        let rendered = 0;
        let refused = 0;

        for (let run = 0; run < runs; run++) {
            const { strings, unsafe } = template(random);
            const values = strings.slice(1).map((_, i) => `${adversarial(random, 3)}CW${i}M${adversarial(random, 3)}`);
            let markup;
            try {
                markup = html(strings, ...values);
            } catch {
                refused++;
                continue;
            }
            rendered++;
            if (unsafe) failures.push({ run, why: 'rendered a template with an unsafe position', markup: String(markup) });

            const seen = values.map(() => 0);
            const record = (text, where) => {
                for (const match of text.matchAll(/CW(\d+)M/g)) {
                    if (where) failures.push({ run, why: `marker ${match[0]} ${where}`, markup: String(markup) });
                    else seen[Number(match[1])]++;
                }
            };
            const walker = document.createTreeWalker(fragment(markup), NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.nodeType === Node.COMMENT_NODE) record(node.data, 'in a comment');
                else if (node.nodeType === Node.TEXT_NODE) {
                    const parent = node.parentNode;
                    const raw = parent && parent.nodeType === Node.ELEMENT_NODE && RAW_TEXT.has(parent.localName);
                    record(node.data, raw ? `in raw text of <${parent.localName}>` : '');
                } else {
                    record(node.localName, 'in a tag name');
                    for (const attr of node.attributes) {
                        record(attr.name, 'in an attribute name');
                        record(attr.value, /^on/i.test(attr.name) || attr.name.toLowerCase() === 'srcdoc' ? `in ${attr.name}` : '');
                    }
                }
            }
            seen.forEach((count, i) => {
                if (count !== 1) failures.push({ run, why: `marker CW${i}M appears ${count} times`, markup: String(markup) });
            });
        }
        return { failures: failures.slice(0, 5), total: failures.length, rendered, refused };
    }, { seed: SEED, runs: RUNS });

    expect(report.failures, `FUZZ_SEED=${SEED}: ${report.total} failure(s)`).toEqual([]);
    // The run must not be vacuous: most templates render.
    expect(report.rendered).toBeGreaterThan(RUNS / 4);
});
