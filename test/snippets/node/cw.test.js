// Runs the shared cases in ../vectors.json against cw.js:
//   node --test test/snippets/node/cw.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { cw, cwAttrs } from './cw.js';

const { cases } = JSON.parse(await readFile(new URL('../vectors.json', import.meta.url), 'utf8'));

const DECODE = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

/**
 * The attributes a browser reads from an expected string: [name, value]
 * pairs, with '' for a bare attribute. This is what cw() must give JSX.
 * @param {string} html
 */
const decode = (html) => [...html.matchAll(/([^\s="]+)(?:="([^"]*)")?/g)]
    .map(([, name, value = '']) => [name, value.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => DECODE[entity])]);

test('every case has its own name, and either an expected string or an error', () => {
    assert.equal(new Set(cases.map((c) => c.name)).size, cases.length);
    for (const c of cases) assert.ok((typeof c.expected === 'string') !== (c.error === true), c.name);
});

for (const c of cases) {
    test(c.name, () => {
        if (c.error) {
            assert.throws(() => cwAttrs(c.action, c.props, c.options), TypeError);
            assert.throws(() => cw(c.action, c.props, c.options), TypeError);
            return;
        }
        assert.equal(cwAttrs(c.action, c.props, c.options), c.expected);
        assert.deepEqual(Object.entries(cw(c.action, c.props, c.options)), decode(c.expected));
    });
}

test('cw() gives JSX raw values, and bare attributes as empty strings', () => {
    assert.deepEqual(cw('cart#add', { sku: 'wire-01', note: '<b>"hi"</b>' }, { trigger: 'visible', once: true, prevent: true }), {
        'cw-action': 'cart#add',
        'cw-props': '{"sku":"wire-01","note":"<b>\\"hi\\"</b>"}',
        'cw-trigger': 'visible',
        'cw-once': '',
        'cw-prevent': '',
    });
});

test('undefined leaves props and options out', () => {
    assert.equal(cwAttrs('cart', undefined, { trigger: undefined, on: undefined, prefix: undefined }), 'cw-action="cart"');
    assert.equal(cwAttrs('cart'), 'cw-action="cart"');
});

test('props that JSON cannot hold throw', () => {
    assert.throws(() => cw('cart', () => {}), TypeError);
    assert.throws(() => cw('cart', Symbol('sku')), TypeError);
    assert.throws(() => cw('cart', { big: 1n }), TypeError);
});

test('an action that is not a string throws', () => {
    for (const action of [undefined, null, 42, ['cart']]) {
        assert.throws(() => cw(/** @type {any} */ (action)), TypeError, String(action));
    }
});
