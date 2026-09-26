/**
 * The morph correctness cases. Each starts a fresh container with `before`,
 * does what a person would have done to the page (focus, type, scroll, open),
 * morphs the container to `after`, and lists what is not as a person would
 * want it. The metadata is read in Node; prepare() and check() run in the
 * page.
 *
 * `want` says what a person would want, and `why`. Where libraries differ by
 * design rather than by mistake, `design` says so, and the report shows it
 * next to the result.
 */
import { canonical, difference } from './canonical.js';

const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

/**
 * @typedef {object} CheckContext
 * @property {HTMLElement} target  a detached element holding `after`, parsed by the page
 */

/**
 * @typedef {object} Case
 * @property {string} id
 * @property {string} title
 * @property {string} want
 * @property {string} why
 * @property {string} [design]  where the libraries disagree by design
 * @property {string} before
 * @property {string} after
 * @property {(container: HTMLElement) => Record<string, any>} [prepare]  what the person did
 * @property {(container: HTMLElement, state: Record<string, any>, context: CheckContext) => string[]} check
 */

/** The container's markup against the target's. @param {Element} container @param {Element} target */
const sameMarkup = (container, target) => {
    const problem = difference(canonical(container), canonical(target));
    return problem ? [`the markup ${problem}`] : [];
};

/** @param {unknown} actual @param {unknown} expected @param {string} what */
const kept = (actual, expected, what) => (actual === expected ? [] : [actual ? `${what} is a new element, not the one that was there` : `${what} is missing`]);

/** @param {Element} container @param {string} selector */
const $ = (container, selector) => /** @type {any} */ (container.querySelector(selector));

/** @type {Case[]} */
export const CASES = [
    {
        id: 'markup',
        title: 'The final markup equals the target',
        want: 'The container holds exactly what the new HTML describes: the same elements, attributes, text and comments, in the same order.',
        why: 'Keeping state is a refinement of this. A morph that keeps focus but shows the wrong content is broken.',
        before: `<header class="summary"><h2>Cart</h2><p>2 items, <strong>€40.00</strong></p></header>
<!-- items -->
<ul class="items">
  <li data-sku="a1">Lamp <small>€25.00</small></li>
  <li data-sku="b2">Mug <small>€15.00</small></li>
</ul>
<p class="note">Free shipping over €50.</p>`,
        after: `<header class="summary updated"><h2>Cart</h2><p>3 items, <b>€52.00</b></p></header>
<!-- items (3) -->
<ul class="items">
  <li data-sku="a1">Lamp <small>€25.00</small></li>
  <li data-sku="c3" class="new">Pen <small>€12.00</small></li>
  <li data-sku="b2">Mug <small>€15.00</small></li>
</ul>
<p class="note shipping">Shipping is free.</p>
<button type="button" disabled>Check out</button>`,
        check: (container, _state, { target }) => sameMarkup(container, target),
    },
    {
        id: 'keyed-reorder',
        title: 'A keyed list reordered keeps each element',
        want: 'Every list item with an id is the same element after the reorder, only moved, and the list reads in the new order.',
        why: 'Elements carry state the markup does not: a checked box, event listeners, a running animation, a third-party widget. Recreating them loses it.',
        before: `<ol id="queue">
${[1, 2, 3, 4, 5, 6].map((n) => `  <li id="task-${n}"><input type="checkbox" aria-label="Done"> <span>Task ${n}</span></li>`).join('\n')}
</ol>`,
        after: `<ol id="queue">
${[4, 1, 6, 2, 5, 3].map((n) => `  <li id="task-${n}"><input type="checkbox" aria-label="Done"> <span>Task ${n}${n === 6 ? ' (urgent)' : ''}</span></li>`).join('\n')}
</ol>`,
        prepare(container) {
            return { items: new Map([...container.querySelectorAll('li')].map((li) => [li.id, li])) };
        },
        check(container, { items }, { target }) {
            const problems = sameMarkup(container, target);
            for (const [id, li] of items) problems.push(...kept(container.querySelector(`#${id}`), li, `#${id}`));
            return problems;
        },
    },
    {
        id: 'focus-selection',
        title: 'A focused input keeps focus and its selection while its surroundings change',
        want: 'The input the person is typing in keeps focus and the selected text, while the status above it changes, a notice appears before it and the results below it shrink.',
        why: 'Losing focus mid-typing sends the next keystrokes nowhere, and a moved caret makes them land in the wrong place. Live search and validation do exactly this kind of update.',
        before: `<p class="status">3 results</p>
<label for="q">Search</label>
<input id="q" name="q" type="text" value="lamp" autocomplete="off">
<ul class="results"><li>Desk lamp</li><li>Floor lamp</li><li>Lamp shade</li></ul>`,
        after: `<p class="status">2 results</p>
<p class="notice">Showing matches for “lamp”.</p>
<label for="q">Search</label>
<input id="q" name="q" type="text" value="lamp" autocomplete="off">
<ul class="results"><li>Desk lamp</li><li>Floor lamp</li></ul>`,
        prepare(container) {
            const input = $(container, '#q');
            input.focus();
            input.setSelectionRange(1, 3);
            return { input, focused: document.activeElement === input };
        },
        check(container, { input, focused }, { target }) {
            const problems = sameMarkup(container, target);
            if (!focused) problems.push('the page could not focus the input before the morph');
            problems.push(...kept($(container, '#q'), input, 'the input'));
            if (document.activeElement !== $(container, '#q')) problems.push(`focus moved to ${document.activeElement?.localName ?? 'nothing'}`);
            const now = $(container, '#q');
            if (now && (now.selectionStart !== 1 || now.selectionEnd !== 3)) problems.push(`the selection is ${now.selectionStart}–${now.selectionEnd}, not 1–3`);
            return problems;
        },
    },
    {
        id: 'typed-value',
        title: "An input's typed value survives when the new markup does not set a value",
        want: 'What the person typed into a field stays there when the server re-renders the form around it with the same, value-less input.',
        why: 'The server does not know what was typed, so its markup cannot carry it; losing it means typing it again.',
        design: "morphdom and idiomorph make an input's value match the markup: an input without a value attribute is emptied, which lets a server clear a form by sending it again, and means the server must echo typed values to keep them (idiomorph's ignoreActiveValue option keeps the focused field's value only). CycleWire copies the value only when the value attribute itself changed, so typed text survives, and a server clears a field by changing that attribute.",
        before: `<label for="email">Email</label>
<input id="email" name="email" type="email">
<p class="hint">We never share your address.</p>`,
        after: `<label for="email">Email</label>
<input id="email" name="email" type="email">
<p class="hint">We never share your address. You can unsubscribe at any time.</p>`,
        prepare(container) {
            const input = $(container, '#email');
            // Typing sets the value, not the attribute; then the person moved on.
            input.value = 'ada@example.com';
            input.blur();
            return { input };
        },
        check(container, { input }, { target }) {
            const problems = sameMarkup(container, target);
            problems.push(...kept($(container, '#email'), input, 'the input'));
            const value = $(container, '#email')?.value;
            if (value !== 'ada@example.com') problems.push(`the field holds ${JSON.stringify(value)}, not what was typed`);
            return problems;
        },
    },
    {
        id: 'attributes',
        title: 'Attributes are added, changed and removed',
        want: 'Each element ends up with exactly the new attributes, and stays the same element.',
        why: 'Classes, ARIA states, data attributes and boolean attributes such as disabled are how server markup changes appearance and behaviour.',
        before: `<div id="panel" class="card" title="Closed panel" data-state="closed" aria-expanded="false">
  <button type="button" class="toggle" disabled>Open</button>
</div>`,
        after: `<div id="panel" class="card open" data-state="open" aria-expanded="true" role="region">
  <button type="button" class="toggle" aria-pressed="true">Close</button>
</div>`,
        prepare(container) {
            return { panel: $(container, '#panel'), button: $(container, 'button') };
        },
        check(container, { panel, button }, { target }) {
            const problems = sameMarkup(container, target);
            problems.push(...kept($(container, '#panel'), panel, 'the panel'), ...kept($(container, 'button'), button, 'the button'));
            if ($(container, 'button')?.disabled) problems.push('the button is still disabled');
            return problems;
        },
    },
    {
        id: 'text',
        title: 'Text changes',
        want: 'The text reads as the new markup says, and the elements around it stay the same elements.',
        why: 'Most server updates change a number or a sentence; that should not cost the elements.',
        before: `<h2 class="title">Orders</h2>
<p class="summary">You have <strong>2</strong> open orders.</p>
<p class="updated">Updated 5 minutes ago</p>`,
        after: `<h2 class="title">Orders</h2>
<p class="summary">You have <strong>3</strong> open orders &amp; 1 return.</p>
<p class="updated">Updated just now</p>`,
        prepare(container) {
            return { summary: $(container, '.summary'), strong: $(container, 'strong') };
        },
        check(container, { summary, strong }, { target }) {
            return [...sameMarkup(container, target), ...kept($(container, '.summary'), summary, 'the summary'), ...kept($(container, 'strong'), strong, 'the <strong>')];
        },
    },
    {
        id: 'svg',
        title: 'SVG children are created in the SVG namespace',
        want: 'Bars, labels and paths added to an existing chart are SVG elements, so they render, and the chart itself stays the same element.',
        why: 'An element with the right name in the HTML namespace renders nothing, silently.',
        before: `<svg id="chart" viewBox="0 0 100 50" width="200" height="100" role="img" aria-label="Sales">
  <rect class="bar" x="0" y="30" width="10" height="20"></rect>
</svg>`,
        after: `<svg id="chart" viewBox="0 0 100 50" width="200" height="100" role="img" aria-label="Sales">
  <rect class="bar" x="0" y="20" width="10" height="30"></rect>
  <rect class="bar" x="15" y="10" width="10" height="40"></rect>
  <g class="labels"><text x="0" y="50">Mon</text><text x="15" y="50">Tue</text></g>
  <path d="M0 50 L100 0" stroke="currentColor"></path>
</svg>`,
        prepare(container) {
            return { chart: $(container, '#chart') };
        },
        check(container, { chart }, { target }) {
            const problems = [...sameMarkup(container, target), ...kept($(container, '#chart'), chart, 'the chart')];
            const wrong = [...container.querySelectorAll('#chart *')].filter((el) => el.namespaceURI !== SVG);
            if (wrong.length) problems.push(`${wrong.length} element(s) inside the chart are not SVG: ${wrong.map((el) => el.localName).join(', ')}`);
            return problems;
        },
    },
    {
        id: 'svg-xlink',
        title: 'An xlink:href added to an SVG element is in the XLink namespace',
        want: 'A sprite icon whose <use> gains xlink:href shows the referenced symbol.',
        why: 'An edge case, but a real one: icon sprites are still often written with xlink:href, and a plain attribute that happens to be called "xlink:href" references nothing.',
        before: `<svg class="icon" width="16" height="16" viewBox="0 0 16 16"><use href="#icon-cart"></use></svg>`,
        after: `<svg class="icon" width="16" height="16" viewBox="0 0 16 16"><use xlink:href="#icon-check"></use></svg>`,
        prepare(container) {
            return { use: $(container, 'use') };
        },
        check(container, { use }, { target }) {
            const problems = [...sameMarkup(container, target), ...kept($(container, 'use'), use, 'the <use>')];
            const now = $(container, 'use');
            if (now?.getAttributeNS(XLINK, 'href') !== '#icon-check') problems.push('the <use> has no xlink:href in the XLink namespace');
            if (now?.href?.baseVal !== '#icon-check') problems.push(`the <use> references ${JSON.stringify(now?.href?.baseVal ?? null)}, not "#icon-check"`);
            return problems;
        },
    },
    {
        id: 'details-open',
        title: 'An open <details> stays open when the new markup does not say otherwise',
        want: 'A section the person opened stays open when its content is updated; one the new markup marks open opens.',
        why: 'The server renders details closed because it does not know what the person opened. Closing it under them hides what they were reading.',
        design: 'Opening a <details> sets its open attribute, so to a morph that copies attributes exactly, markup without open means closed. None of the three keeps it open by default; each can be told to through its update callback (beforeUpdate, onBeforeElUpdated, beforeAttributeUpdated).',
        before: `<details id="shipping"><summary>Shipping</summary><p>Ships in 2 days.</p></details>
<details id="returns"><summary>Returns</summary><p>30 days.</p></details>`,
        after: `<details id="shipping"><summary>Shipping</summary><p>Ships in 1–2 days.</p></details>
<details id="returns" open><summary>Returns</summary><p>30 days, free.</p></details>`,
        prepare(container) {
            const shipping = $(container, '#shipping');
            shipping.open = true;
            return { shipping };
        },
        check(container, { shipping }) {
            const problems = kept($(container, '#shipping'), shipping, 'the shipping section');
            if (!$(container, '#shipping')?.open) problems.push('the section the person opened was closed');
            if (!$(container, '#returns')?.open) problems.push('the section the new markup marks open is closed');
            if (!container.textContent?.includes('Ships in 1–2 days.') || !container.textContent.includes('30 days, free.')) problems.push('the text was not updated');
            return problems;
        },
    },
    {
        id: 'scroll',
        title: 'A scrolled container keeps its element and scroll position',
        want: 'A scrolled message log stays the same element at the same scroll position when a message is added to it and the heading above it changes.',
        why: 'Jumping back to the top while someone reads is disorienting, and it is the first thing people notice when a region is re-rendered.',
        before: `<h2 class="title">Messages (40)</h2>
<div id="log" class="log" style="height: 100px; overflow: auto">
${Array.from({ length: 40 }, (_, i) => `  <p>Message ${i + 1}</p>`).join('\n')}
</div>`,
        after: `<h2 class="title">Messages (41)</h2>
<div id="log" class="log" style="height: 100px; overflow: auto">
${Array.from({ length: 41 }, (_, i) => `  <p>Message ${i + 1}</p>`).join('\n')}
</div>`,
        prepare(container) {
            const log = $(container, '#log');
            log.scrollTop = 250;
            return { log, scrolled: log.scrollTop };
        },
        check(container, { log, scrolled }, { target }) {
            const problems = [...sameMarkup(container, target), ...kept($(container, '#log'), log, 'the log')];
            if (scrolled < 200) problems.push(`the page could not scroll the log before the morph (${scrolled}px)`);
            const top = $(container, '#log')?.scrollTop ?? 0;
            if (Math.abs(top - scrolled) > 1) problems.push(`the log is scrolled to ${top}px, not ${scrolled}px`);
            return problems;
        },
    },
    {
        id: 'custom-element',
        title: 'A custom element keeps its identity',
        want: 'A custom element whose attribute and content change is the same element afterwards, with its internal state and shadow root, and it sees the new attribute.',
        why: 'Custom elements keep state in JavaScript and in their shadow root; replacing one resets it, and its disconnected and connected callbacks run for nothing.',
        before: `<p class="intro">Tap to count.</p>
<bench-counter label="Add">in the basket</bench-counter>`,
        after: `<p class="intro">Tap to count, again.</p>
<bench-counter label="Add one more">in the basket</bench-counter>`,
        prepare(container) {
            const counter = $(container, 'bench-counter');
            counter.count = 3;
            counter.render();
            return { counter, shadow: counter.shadowRoot };
        },
        check(container, { counter, shadow }, { target }) {
            const problems = [...sameMarkup(container, target), ...kept($(container, 'bench-counter'), counter, 'the custom element')];
            const now = $(container, 'bench-counter');
            if (now?.count !== 3) problems.push('its internal state was reset');
            if (now?.shadowRoot !== shadow) problems.push('its shadow root was replaced');
            const shown = now?.shadowRoot?.querySelector('button')?.textContent;
            if (shown !== 'Add one more (3)') problems.push(`it shows ${JSON.stringify(shown)}, not "Add one more (3)"`);
            return problems;
        },
    },
    {
        id: 'template',
        title: '<template> content is updated',
        want: "A <template>'s content matches the new markup, and nothing leaks out of it into the page.",
        why: 'Templates hold the markup that client code stamps out later; a stale one stamps out old markup.',
        before: `<template id="row-template"><li class="row"><span class="name"></span></li></template>
<ul class="rows"></ul>`,
        after: `<template id="row-template"><li class="row"><span class="name"></span> <button type="button" class="remove">Remove</button></li></template>
<ul class="rows"></ul>`,
        prepare(container) {
            return { template: $(container, 'template') };
        },
        check(container, { template }, { target }) {
            const problems = [...sameMarkup(container, target), ...kept($(container, 'template'), template, 'the template')];
            const now = $(container, 'template');
            if (now?.childNodes.length) problems.push('the template has child nodes outside its content');
            return problems;
        },
    },
];

/** @param {string} id */
export const morphCase = (id) => CASES.find((entry) => entry.id === id);

/** The custom element the custom-element case uses, defined by the page. */
export function defineCounter() {
    if (customElements.get('bench-counter')) return;
    customElements.define(
        'bench-counter',
        class extends HTMLElement {
            static observedAttributes = ['label'];
            constructor() {
                super();
                this.count = 0;
                this.attachShadow({ mode: 'open' }).innerHTML = '<button type="button"></button> <slot></slot>';
            }
            connectedCallback() {
                this.render();
            }
            attributeChangedCallback() {
                this.render();
            }
            render() {
                const button = this.shadowRoot?.querySelector('button');
                if (button) button.textContent = `${this.getAttribute('label') ?? ''} (${this.count})`;
            }
        },
    );
}
