import assert from 'node:assert/strict';
import { test } from 'node:test';
import { literal, referencesIn, syntaxOf } from '../../tooling/templates.js';

const values = (source, options) => referencesIn(source, options).map(({ kind, attribute, value }) => [kind, attribute, value]);

test('the file name picks the template language', () => {
    assert.equal(syntaxOf('resources/views/cart.blade.php'), 'blade');
    assert.equal(syntaxOf('app/views/cart/show.html.erb'), 'erb');
    assert.equal(syntaxOf('templates/cart.html'), 'html');
    assert.equal(syntaxOf('src/Cart.tsx'), 'script');
    assert.equal(syntaxOf('src/Cart.vue'), 'vue');
    assert.equal(syntaxOf('views/page.twig'), 'twig');
});

test('HTML: quoted, unquoted and bare attributes, with positions', () => {
    const source = `<form data-cw-action="cart#add" data-cw-props='{"sku":"a"}' data-cw-once>\n  <input data-cw-on-input=search data-cw-debounce="150">\n</form>`;
    assert.deepEqual(values(source), [
        ['action', 'data-cw-action', 'cart#add'],
        ['props', 'data-cw-props', '{"sku":"a"}'],
        ['once', 'data-cw-once', ''],
        ['action', 'data-cw-on-input', 'search'],
        ['debounce', 'data-cw-debounce', '150'],
    ]);
    const [first, , , fourth] = referencesIn(source);
    assert.deepEqual([first.line, first.column], [1, 7]);
    assert.deepEqual([fourth.line, fourth.column], [2, 10]);
});

test('values built by a template language are dynamic', () => {
    const blade = '<button data-cw-action="{{ $action }}" data-cw-props=\'@json($props)\'>';
    assert.deepEqual(values(blade, { syntax: 'blade' }), [['action', 'data-cw-action', null], ['props', 'data-cw-props', null]]);
    // An email address is not a directive.
    assert.deepEqual(values(`<a data-cw-props='{"to":"ada@example.com"}'>`), [['props', 'data-cw-props', '{"to":"ada@example.com"}']]);
    assert.deepEqual(values('<a data-cw-action="<%= name %>">', { syntax: 'erb' }), [['action', 'data-cw-action', null]]);
    assert.deepEqual(values('<a data-cw-action="{% if x %}a{% endif %}">', { syntax: 'jinja' }), [['action', 'data-cw-action', null]]);
    assert.deepEqual(values('<a data-cw-action="cart#{kind}">', { syntax: 'svelte' }), [['action', 'data-cw-action', null]]);
    assert.deepEqual(values('html`<a data-cw-action="${name}">`', { syntax: 'script' }), [['action', 'data-cw-action', null]]);
});

test('JSX, Vue, Svelte and Astro expressions: string literals are static', () => {
    assert.deepEqual(values(`<button data-cw-action={'cart#add'} data-cw-props={JSON.stringify({ sku })} data-cw-trigger={\`visible\`} />`, { syntax: 'script' }), [
        ['action', 'data-cw-action', 'cart#add'],
        ['props', 'data-cw-props', null],
        ['trigger', 'data-cw-trigger', 'visible'],
    ]);
    assert.deepEqual(values(`<button :data-cw-action="'cart#add'" v-bind:data-cw-props="props" data-cw-preload="idle">`, { syntax: 'vue' }), [
        ['action', 'data-cw-action', 'cart#add'],
        ['props', 'data-cw-props', null],
        ['preload', 'data-cw-preload', 'idle'],
    ]);
    assert.deepEqual(literal('`a${b}`'), null);
    assert.deepEqual(literal(" 'it\\'s' "), "it's");
});

test('the server helpers count as data-cw-action', () => {
    assert.deepEqual(values(`<button @cw('cart#add', ['sku' => $sku])>`, { syntax: 'blade' }), [['action', '@cw', 'cart#add']]);
    assert.deepEqual(values(`<button <%= cw('cart#add', { sku: @sku }) %>> <form <%= cw "search", nil, trigger: 'visible' %>>`, { syntax: 'erb' }), [
        ['action', 'cw()', 'cart#add'],
        ['action', 'cw()', 'search'],
    ]);
    assert.deepEqual(values(`{% load cyclewire_tags %}<button {% cw 'cart#add' props %}>`, { syntax: 'html' }), [['action', '{% cw %}', 'cart#add']]);
    assert.deepEqual(values(`<button {...cw('cart#add', { sku })}>{cwAttrs("like")}</button>`, { syntax: 'script' }), [
        ['action', 'cw()', 'cart#add'],
        ['action', 'cwAttrs()', 'like'],
    ]);
});

test('comments are not checked, and similar attribute names are not matched', () => {
    const source = `<!-- <button data-cw-action="gone"> -->\n{{-- <b data-cw-action="also-gone"> --}}\n<i data-cw-actions="x" x-data-cw-action="y" data-cw-action-extra="z" data-cw-action="kept"></i>`;
    assert.deepEqual(values(source, { syntax: 'blade' }), [['action', 'data-cw-action', 'kept']]);
    assert.deepEqual(values('// <a data-cw-action="gone">\nconst a = 1; /* data-cw-action="gone" */\n<a data-cw-action="kept">', { syntax: 'script' }), [['action', 'data-cw-action', 'kept']]);
});

test('a custom prefix, or none', () => {
    assert.deepEqual(values('<a data-x-action="a" data-cw-action="b">', { prefix: 'x-' }), [['action', 'data-x-action', 'a']]);
    assert.deepEqual(values('<a data-action="a" data-trigger="load">', { prefix: '' }), [['action', 'data-action', 'a'], ['trigger', 'data-trigger', 'load']]);
});
