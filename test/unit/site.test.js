import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { stamp, version } from '../../scripts/site.js';

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
    assert.doesNotMatch(html.replace(/data-version>v\d+\.\d+\.\d+</g, ''), /\bv\d+\.\d+\.\d+\b/);
});
