import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { insertBenchmark, stamp, stampSizes, version } from '../../scripts/site.js';

test('stamp writes the version into every element marked data-version, and counts them', () => {
    const { html, count } = stamp('<b data-version>v0.0.0</b> <span class="x" data-version>old</span> <i data-versions>keep</i>', '1.2.3');
    assert.equal(html, '<b data-version>v1.2.3</b> <span class="x" data-version>v1.2.3</span> <i data-versions>keep</i>');
    assert.equal(count, 2);
});

test('the landing page marks every place it shows the version', async () => {
    const page = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8');
    const { html, count } = stamp(page, await version());
    assert.equal(count, 3);
    // Any version written without a mark would go stale at the next release.
    assert.doesNotMatch(html.replace(/data-version>v\d+\.\d+\.\d+(?:-[\w.]+)?</g, ''), /\bv\d+\.\d+\.\d+\b/);
});

test('the benchmark section goes between the landing page\'s marks, and a page without them fails the build', async () => {
    const page = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8');
    const html = insertBenchmark(page, '<p id="results">$& $1</p>');
    assert.match(html, /<!-- bench:start -->\n<p id="results">\$& \$1<\/p>\n<!-- bench:end -->/);
    assert.doesNotMatch(html, /The results appear here/);
    assert.throws(() => insertBenchmark('<main></main>', '<p></p>'), /bench:start/);
});

test('sizes come from dist/sizes.json, and the page writes none by hand', async () => {
    const sizes = { files: { 'cyclewire.min.js': { label: '4.8 kB' }, 'css.min.js': { label: '0.6 kB' } } };
    assert.deepEqual(stampSizes('<b data-size="cyclewire.min.js">4.7 kB</b> <td class="x" data-size="css.min.js">old</td>', sizes), {
        html: '<b data-size="cyclewire.min.js">4.8 kB</b> <td class="x" data-size="css.min.js">0.6 kB</td>',
        count: 2,
    });
    assert.throws(() => stampSizes('<b data-size="missing.js">1 kB</b>', sizes), /missing\.js/);
    const page = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8');
    // Every size on the page is marked; unmarked ones would go stale at the next release.
    assert.doesNotMatch(page.replace(/data-size="[^"]+">[\d.]+ kB</g, ''), /\b\d+(?:\.\d)? kB\b/);
});
