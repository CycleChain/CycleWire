import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionsOf, attrNames, concurrency, defaultEvent, isPassive, splitName } from '../../src/attrs.js';

/** A stand-in for an element: just enough for the attribute helpers. */
function el(localName, attributes = {}, type) {
    return {
        localName,
        type,
        getAttributeNames: () => Object.keys(attributes),
        getAttribute: (name) => (name in attributes ? attributes[name] : null),
    };
}

test('attribute names derive from one prefix', () => {
    assert.equal(attrNames('cw-').action, 'cw-action');
    assert.equal(attrNames('cw-').on, 'cw-on-');
    // data-cw- gives names HTML validators accept.
    assert.equal(attrNames('data-cw-').props, 'data-cw-props');
    assert.equal(attrNames('x-').pending, 'x-pending');
    // An empty prefix means data-: a bare "action" is already a form attribute.
    assert.equal(attrNames('').action, 'data-action');
    assert.equal(attrNames('').trigger, 'data-trigger');
});

test('the shorthand listens for the event natural to the element', () => {
    assert.equal(defaultEvent(el('form')), 'submit');
    assert.equal(defaultEvent(el('button')), 'click');
    assert.equal(defaultEvent(el('a')), 'click');
    assert.equal(defaultEvent(el('div')), 'click');
    assert.equal(defaultEvent(el('select')), 'change');
    assert.equal(defaultEvent(el('textarea')), 'input');
    assert.equal(defaultEvent(el('details')), 'toggle');
    assert.equal(defaultEvent(el('input', {}, 'text')), 'input');
    assert.equal(defaultEvent(el('input', {}, 'search')), 'input');
    assert.equal(defaultEvent(el('input', {}, 'checkbox')), 'change');
    assert.equal(defaultEvent(el('input', {}, 'radio')), 'change');
    assert.equal(defaultEvent(el('input', {}, 'date')), 'change');
    assert.equal(defaultEvent(el('input', {}, 'submit')), 'click');
    assert.equal(defaultEvent(el('input', {}, 'image')), 'click');
});

test('concurrency defaults follow the event type', () => {
    assert.equal(concurrency(null, 'click'), 'drop');
    assert.equal(concurrency(null, 'submit'), 'drop');
    assert.equal(concurrency(null, 'command'), 'drop');
    assert.equal(concurrency(null, null), 'drop');
    assert.equal(concurrency(null, 'input'), 'restart');
    assert.equal(concurrency(null, 'change'), 'latest');
    assert.equal(concurrency(null, 'toggle'), 'latest');
    assert.equal(concurrency(null, 'keydown'), 'parallel');
    assert.equal(concurrency('parallel', 'click'), 'parallel');
    // An invalid value falls back to the default.
    assert.equal(concurrency('sometimes', 'input'), 'restart');
});

test('module#export names split on the first hash', () => {
    assert.deepEqual(splitName('cart'), ['cart', '']);
    assert.deepEqual(splitName('cart#add'), ['cart', 'add']);
    assert.deepEqual(splitName('ui.menu#open'), ['ui.menu', 'open']);
});

test('only non-cancelable, high-frequency events are passive', () => {
    for (const type of ['pointerover', 'pointermove', 'touchstart', 'wheel', 'scroll', 'mouseenter']) assert.ok(isPassive(type), type);
    for (const type of ['click', 'submit', 'keydown', 'pointerdown', 'command', 'contextmenu']) assert.ok(!isPassive(type), type);
});

test('actionsOf collects every binding on an element', () => {
    const attrs = attrNames('cw-');
    const node = el('button', {
        'cw-action': ' cart#add ',
        'cw-on-pointerenter': 'cart#peek',
        'cw-once': '',
        class: 'btn',
    });
    assert.deepEqual(actionsOf(node, attrs), ['cart#add', 'cart#peek']);
    // A binding left blank binds nothing.
    assert.deepEqual(actionsOf(el('button', { 'cw-action': '  ', 'cw-on-click': '' }), attrs), []);
});
