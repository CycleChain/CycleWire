import '../unit/setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromGlob } from '../../src/index.js';
import { distance, handlerOf, isValid, nameOf, suggest } from '../../tooling/names.js';

test('names match fromGlob() for every kind of path', () => {
    const paths = [
        './actions/cart.js', './actions/cart/add.ts', './actions/cart/index.js', './actions/deep/er/index.tsx',
        './actions/modal.mjs', './actions/legacy.cjs', './actions/panel.jsx', './actions/a.b.js', './other/place.js',
        './actions/with-dash_and_underscore.mts', './actions/index.js',
    ];
    const expected = paths.map((path) => Object.keys(fromGlob({ [path]: () => Promise.resolve({}) }))[0]);
    assert.deepEqual(paths.map((path) => nameOf(path)), expected);
    assert.deepEqual(expected, ['cart', 'cart.add', 'cart', 'deep.er', 'modal', 'legacy', 'panel', 'a.b', '..other.place', 'with-dash_and_underscore', 'index']);
    // A custom base, as fromGlob(modules, base) takes.
    assert.equal(nameOf('../js/widgets/map.js', '../js/widgets/'), Object.keys(fromGlob({ '../js/widgets/map.js': () => Promise.resolve({}) }, '../js/widgets/'))[0]);
});

test('valid names follow the registry', () => {
    for (const name of ['cart', 'cart#add', 'cart.add#run', 'a-b_c.d#$x', 'cart#']) assert.ok(isValid(name), name);
    for (const name of ['', '../evil', 'a b', 'cart#add#x', 'cart#a-b', 'https://x.test/a.js']) assert.ok(!isValid(name), name);
});

test('a bare name runs run, then default', () => {
    assert.equal(handlerOf('', ['run', 'default', 'add']), 'run');
    assert.equal(handlerOf('', ['default']), 'default');
    assert.equal(handlerOf('', ['add']), null);
    assert.equal(handlerOf('add', ['add']), 'add');
    assert.equal(handlerOf('remove', ['add']), null);
});

test('suggestions are close names, best first', () => {
    assert.equal(distance('cart#ad', 'cart#add'), 1);
    assert.equal(distance('crat', 'cart'), 1);
    assert.deepEqual(suggest('cart#ad', ['cart#add', 'cart#remove', 'search', 'cart#and']), ['cart#add', 'cart#and']);
    assert.deepEqual(suggest('zzz', ['cart', 'search']), []);
});
