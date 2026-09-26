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
    const source = `<form cw-action="cart#add" cw-props='{"sku":"a"}' cw-once>\n  <input cw-on-input=search cw-debounce="150">\n</form>`;
    assert.deepEqual(values(source), [
        ['action', 'cw-action', 'cart#add'],
        ['props', 'cw-props', '{"sku":"a"}'],
        ['once', 'cw-once', ''],
        ['action', 'cw-on-input', 'search'],
        ['debounce', 'cw-debounce', '150'],
    ]);
    const [first, , , fourth] = referencesIn(source);
    assert.deepEqual([first.line, first.column], [1, 7]);
    assert.deepEqual([fourth.line, fourth.column], [2, 10]);
});

test('values built by a template language are dynamic', () => {
    const blade = '<button cw-action="{{ $action }}" cw-props=\'@json($props)\'>';
    assert.deepEqual(values(blade, { syntax: 'blade' }), [['action', 'cw-action', null], ['props', 'cw-props', null]]);
    // An email address is not a directive.
    assert.deepEqual(values(`<a cw-props='{"to":"ada@example.com"}'>`), [['props', 'cw-props', '{"to":"ada@example.com"}']]);
    assert.deepEqual(values('<a cw-action="<%= name %>">', { syntax: 'erb' }), [['action', 'cw-action', null]]);
    assert.deepEqual(values('<a cw-action="{% if x %}a{% endif %}">', { syntax: 'jinja' }), [['action', 'cw-action', null]]);
    assert.deepEqual(values('<a cw-action="cart#{kind}">', { syntax: 'svelte' }), [['action', 'cw-action', null]]);
    assert.deepEqual(values('html`<a cw-action="${name}">`', { syntax: 'script' }), [['action', 'cw-action', null]]);
});

test('JSX, Vue, Svelte and Astro expressions: string literals are static', () => {
    assert.deepEqual(values(`<button cw-action={'cart#add'} cw-props={JSON.stringify({ sku })} cw-trigger={\`visible\`} />`, { syntax: 'script' }), [
        ['action', 'cw-action', 'cart#add'],
        ['props', 'cw-props', null],
        ['trigger', 'cw-trigger', 'visible'],
    ]);
    assert.deepEqual(values(`<button :cw-action="'cart#add'" v-bind:cw-props="props" cw-preload="idle">`, { syntax: 'vue' }), [
        ['action', 'cw-action', 'cart#add'],
        ['props', 'cw-props', null],
        ['preload', 'cw-preload', 'idle'],
    ]);
    assert.deepEqual(literal('`a${b}`'), null);
    assert.deepEqual(literal(" 'it\\'s' "), "it's");
});

test('the server helpers count as cw-action', () => {
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
    const source = `<!-- <button cw-action="gone"> -->\n{{-- <b cw-action="also-gone"> --}}\n<i cw-actions="x" x-cw-action="y" cw-action-extra="z" cw-action="kept"></i>`;
    assert.deepEqual(values(source, { syntax: 'blade' }), [['action', 'cw-action', 'kept']]);
    assert.deepEqual(values('// <a cw-action="gone">\nconst a = 1; /* cw-action="gone" */\n<a cw-action="kept">', { syntax: 'script' }), [['action', 'cw-action', 'kept']]);
});

test('a custom prefix, or none', () => {
    assert.deepEqual(values('<a x-action="a" cw-action="b" data-x-action="c">', { prefix: 'x-' }), [['action', 'x-action', 'a']]);
    assert.deepEqual(values('<a data-cw-action="a" cw-action="b">', { prefix: 'data-cw-' }), [['action', 'data-cw-action', 'a']]);
    assert.deepEqual(values('<a data-action="a" data-trigger="load">', { prefix: '' }), [['action', 'data-action', 'a'], ['trigger', 'data-trigger', 'load']]);
});
