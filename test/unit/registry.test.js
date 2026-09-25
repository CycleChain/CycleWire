import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromGlob } from '../../src/index.js';
import * as registry from '../../src/registry.js';
import { plugins } from '../../src/state.js';

test('only well-formed names and entries can be registered', (t) => {
    t.mock.method(console, 'warn', () => {});
    registry.register({
        'cart.add': () => Promise.resolve({}),
        '../../evil.js': () => Promise.resolve({}),
        'a b': () => Promise.resolve({}),
        styled: { module: () => Promise.resolve({ run() {} }), css: '/css/styled.css' },
        broken: /** @type {any} */ ({ css: '/css/broken.css' }),
        numeric: /** @type {any} */ (42),
    });
    assert.equal(registry.has('styled'), true);
    assert.equal(registry.has('broken'), false);
    assert.equal(registry.has('numeric'), false);
    assert.equal(registry.has('cart.add'), true);
    assert.equal(registry.has('cart.add#open'), true);
    assert.equal(registry.has('../../evil.js'), false);
    assert.equal(registry.has('a b'), false);
    assert.equal(registry.has('cart.add#bad export'), false);
    assert.equal(registry.has('missing'), false);
});

test('concurrent loads share one import, and a failure can be retried', async () => {
    let calls = 0;
    registry.register({
        flaky: () => {
            calls++;
            return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve({ run() {} });
        },
    });
    const [a, b] = [registry.load('flaky'), registry.load('flaky')];
    assert.equal(a, b);
    await assert.rejects(a, /network/);
    assert.equal(registry.isReady('flaky'), false);
    assert.deepEqual(await registry.load('flaky').then(Object.keys), ['run']);
    assert.equal(calls, 2);
    assert.ok(registry.loaded().includes('flaky'));
});

test('an entry with options loads its module like any other', async () => {
    registry.register({ widget: { module: () => Promise.resolve({ kind: 'widget' }), css: ['/a.css', '/b.css'] } });
    assert.equal((await registry.load('widget')).kind, 'widget');
    assert.equal(registry.isReady('widget'), true);
    assert.deepEqual(registry.entry('widget'), { module: registry.entry('widget')?.module, css: ['/a.css', '/b.css'] });
});

test('preloading hands the whole entry to plugins, every time', async () => {
    /** @type {unknown[][]} */
    const seen = [];
    const plugin = { preload: (/** @type {unknown} */ entry, /** @type {string} */ name) => void seen.push([name, entry]) };
    plugins.push(plugin);
    try {
        const entry = { module: () => Promise.resolve({}), css: '/hinted.css' };
        registry.register({ hinted: entry });
        await registry.preload('hinted');
        await registry.preload('hinted');
        await registry.preload('unknown');
        // The module is imported once; the plugin decides what repeating means.
        assert.deepEqual(seen, [['hinted', entry], ['hinted', entry]]);
    } finally {
        plugins.splice(plugins.indexOf(plugin), 1);
    }
});

test('re-registering a name forgets its cached module', async () => {
    registry.register({ swap: () => Promise.resolve({ version: 1 }) });
    assert.equal((await registry.load('swap')).version, 1);
    registry.register({ swap: () => Promise.resolve({ version: 2 }) });
    assert.equal(registry.isReady('swap'), false);
    assert.equal((await registry.load('swap')).version, 2);
});

test('preloading a loader function imports it once and stays silent on failure', async () => {
    let calls = 0;
    registry.register({
        pre: () => {
            calls++;
            return Promise.resolve({});
        },
        broken: () => Promise.reject(new Error('offline')),
    });
    await registry.preload('pre');
    await registry.preload('pre');
    assert.equal(calls, 1);
    assert.equal(registry.isReady('pre'), true);
    await registry.preload('broken'); // must not reject
    await registry.preload('unknown');
});

test('fromGlob turns file paths into action names', () => {
    const loader = () => Promise.resolve({});
    const actions = fromGlob({
        './actions/cart/add.js': loader,
        './actions/menu.ts': loader,
        './actions/search/index.js': loader,
    });
    assert.deepEqual(Object.keys(actions), ['cart.add', 'menu', 'search']);
    assert.deepEqual(Object.keys(fromGlob({ './other/place.mjs': loader }, './other/')), ['place']);
});
