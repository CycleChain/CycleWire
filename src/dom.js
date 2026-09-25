/**
 * cyclewire/dom — build HTML safely, parse it inertly into a DocumentFragment
 * and put it in the page in one operation.
 *
 *   import { html, swap } from 'cyclewire/dom';
 *   swap(list, html`${items.map((item) => html`<li>${item.name}</li>`)}`);
 */
import { restore, snapshot } from './focus.js';

const BRAND = Symbol.for('cyclewire.html');
const POLICY = Symbol.for('cyclewire.trusted-types');

/** Markup CycleWire may parse as HTML. Only `html` and `html.raw` create it. */
export class SafeHTML {
    /** @param {string} markup */
    constructor(markup) {
        /** @readonly */
        this.markup = markup;
    }

    // A symbol brand, so a plain object (say, from JSON) can never pass as markup.
    get [BRAND]() {
        return true;
    }

    toString() {
        return this.markup;
    }
}

/**
 * @param {unknown} value
 * @returns {value is SafeHTML}
 */
export const isSafeHTML = (value) => value != null && /** @type {any} */ (value)[BRAND] === true;

/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes text for use in HTML content or a quoted attribute value.
 * @param {unknown} value
 */
export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

// Where an interpolation lands. Anything else throws. Interpolations in URL
// attributes get a UrlSlot instead, so the whole value can be checked.
const TEXT = 0;
const VALUE = 1;

// SVG animations (to, from, by, values) can set href as well.
const URL_ATTRS = /^(?:href|src|action|formaction|poster|cite|background|ping|codebase|data|xlink:href|to|from|by|values)$/i;
const RAW_TEXT = /^(?:script|style|xmp|iframe|noembed|noframes|noscript|plaintext)$/i;
const UNSAFE_URL = /^(?:javascript|vbscript):/i;

/**
 * An interpolation inside a URL attribute: the fixed text before it (since the
 * opening quote, or since the previous interpolation) and, for the last one,
 * the fixed text up to the closing quote.
 * @typedef {{ first: boolean, before: string, after?: string, list: boolean }} UrlSlot
 */
/** @typedef {number | UrlSlot} Slot */

/** @type {WeakMap<TemplateStringsArray, Slot[]>} */
const cache = new WeakMap();

/** @param {string} where */
const unsafe = (where) => new TypeError(`[CycleWire] html: an interpolation ${where} cannot be made safe by escaping`);

/**
 * Works out, once per template, where each interpolation sits. Throws for
 * positions escaping cannot protect: tag and attribute names, unquoted and
 * event-handler attribute values, comments, and raw-text elements such as
 * <script> and <style>. A template must also end outside any tag, comment or
 * raw-text element: nested into another template, an open one would change
 * what the outer template's interpolations mean.
 * @param {TemplateStringsArray} strings
 * @returns {Slot[]}
 */
function analyze(strings) {
    const known = cache.get(strings);
    if (known) return known;
    /** @type {Slot[]} */
    const slots = [];
    // text | tag | attr | after-attr | before-value | value | unquoted | comment | raw | end-tag
    let state = 'text';
    let tag = '';
    let attr = '';
    let quote = '';
    // The fixed text of the attribute value being read since its quote or the last interpolation.
    let text = '';
    /** @type {UrlSlot | null} */
    let url = null;
    for (let i = 0; i < strings.length; i++) {
        const s = strings[i];
        for (let j = 0; j < s.length; j++) {
            const c = s[j];
            switch (state) {
                case 'text':
                    if (c !== '<') break;
                    if (s.startsWith('!--', j + 1)) {
                        state = 'comment';
                        j += 3;
                    } else if (j === s.length - 1 || /[a-z]/i.test(s[j + 1])) {
                        // A "<" right before an interpolation would let the value become a tag name.
                        state = 'tag';
                        tag = '';
                    } else if (s[j + 1] === '/' || s[j + 1] === '!' || s[j + 1] === '?') state = 'end-tag';
                    break;
                case 'tag':
                    if (/[\s/>]/.test(c)) {
                        state = c === '>' ? (RAW_TEXT.test(tag) ? 'raw' : 'text') : 'attrs';
                    } else tag += c;
                    break;
                case 'attrs':
                    if (c === '>') state = RAW_TEXT.test(tag) ? 'raw' : 'text';
                    else if (!/[\s/]/.test(c)) {
                        state = 'attr';
                        attr = c;
                    }
                    break;
                case 'attr':
                    if (c === '=') state = 'before-value';
                    else if (/\s/.test(c)) state = 'after-attr';
                    else if (c === '>') state = RAW_TEXT.test(tag) ? 'raw' : 'text';
                    else if (c === '/') state = 'attrs';
                    else attr += c;
                    break;
                case 'after-attr':
                    if (c === '=') state = 'before-value';
                    else if (c === '>') state = RAW_TEXT.test(tag) ? 'raw' : 'text';
                    else if (!/\s/.test(c)) {
                        state = c === '/' ? 'attrs' : 'attr';
                        attr = c === '/' ? '' : c;
                    }
                    break;
                case 'before-value':
                    if (c === '"' || c === "'") {
                        state = 'value';
                        quote = c;
                        text = '';
                        url = null;
                    } else if (c === '>') state = RAW_TEXT.test(tag) ? 'raw' : 'text';
                    else if (!/\s/.test(c)) state = 'unquoted';
                    break;
                case 'value':
                    if (c === quote) {
                        state = 'attrs';
                        if (url) url.after = text;
                    } else text += c;
                    break;
                case 'unquoted':
                    if (/\s/.test(c)) state = 'attrs';
                    else if (c === '>') state = RAW_TEXT.test(tag) ? 'raw' : 'text';
                    break;
                case 'comment':
                    if (s.startsWith('-->', j)) {
                        state = 'text';
                        j += 2;
                    }
                    break;
                case 'raw':
                    if (c === '<' && s.slice(j + 2, j + 2 + tag.length).toLowerCase() === tag.toLowerCase() && s[j + 1] === '/') state = 'end-tag';
                    break;
                case 'end-tag':
                    if (c === '>') state = 'text';
                    break;
            }
        }
        if (i === strings.length - 1) break;
        if (state === 'text') slots.push(TEXT);
        else if (state === 'value') {
            if (/^on/i.test(attr) || /^srcdoc$/i.test(attr)) throw unsafe(`in the ${attr} attribute`);
            if (URL_ATTRS.test(attr)) {
                slots.push((url = { first: !url, before: text, list: /^values$/i.test(attr) }));
                text = '';
            } else slots.push(VALUE);
        } else if (state === 'raw') throw unsafe(`inside <${tag}>`);
        else if (state === 'comment') throw unsafe('inside a comment');
        else if (state === 'before-value' || state === 'unquoted') throw unsafe(`in the unquoted value of ${attr}`);
        else throw unsafe('in a tag or attribute name');
    }
    if (state !== 'text') throw new TypeError('[CycleWire] html: a template must not end inside a tag, a comment or a raw-text element');
    // Tagged templates pass frozen arrays; anything else could change after the analysis.
    if (Object.isFrozen(strings)) cache.set(strings, slots);
    return slots;
}

/**
 * @param {unknown} value
 * @param {Slot} slot
 * @returns {string}
 */
function render(value, slot) {
    if (value == null || value === false) return '';
    if (Array.isArray(value)) return value.map((item) => render(item, slot)).join('');
    if (isSafeHTML(value)) return slot === TEXT ? value.markup : escapeHTML(value.markup);
    return escapeHTML(value);
}

/**
 * The text an interpolation becomes once the browser decodes the attribute.
 * @param {unknown} value
 * @returns {string}
 */
const plain = (value) =>
    value == null || value === false ? '' : Array.isArray(value) ? value.map(plain).join('') : isSafeHTML(value) ? value.markup : String(value);

/**
 * Decodes the character references in fixed template text: the browser does
 * too, before it reads the URL.
 * @param {string} text
 */
const decode = (text) =>
    text.replace(/&(?:#(x?)([\da-f]+)|(colon|tab|newline));?/gi, (_, hex, digits, name) => {
        if (name) return /** @type {Record<string, string>} */ ({ colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()];
        const code = parseInt(digits, hex ? 16 : 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '\ufffd';
    });

/**
 * Refuses a whole attribute value that the browser would run as script.
 * @param {string} value @param {boolean} list  `values` holds a `;`-separated list
 */
function check(value, list) {
    for (const url of list ? value.split(';') : [value]) {
        if (UNSAFE_URL.test(url.replace(/[\x00-\x20\x7f]/g, ''))) {
            throw new TypeError(`[CycleWire] html: refusing the URL ${JSON.stringify(url.trim().slice(0, 40))}`);
        }
    }
}

/**
 * Tagged template that escapes every interpolation for the position it lands
 * in. Nested `html` results and arrays of them are inserted as markup;
 * `null`, `undefined` and `false` render nothing.
 *
 * `html.raw(markup)` marks markup you trust, such as HTML your own server
 * rendered, as safe. It is the only way to get unescaped markup into CycleWire.
 */
export const html = /* @__PURE__ */ Object.assign(
    /**
     * @param {TemplateStringsArray} strings
     * @param {...unknown} values
     * @returns {SafeHTML}
     */
    (strings, ...values) => {
        const slots = analyze(strings);
        let markup = strings[0];
        // The value of the URL attribute being assembled, as the browser will read it.
        let url = '';
        for (let i = 0; i < values.length; i++) {
            const slot = slots[i];
            if (typeof slot === 'object') {
                url = (slot.first ? '' : url) + decode(slot.before) + plain(values[i]);
                if (slot.after != null) check(url + decode(slot.after), slot.list);
            }
            markup += render(values[i], slot) + strings[i + 1];
        }
        return new SafeHTML(markup);
    },
    {
        /**
         * @param {unknown} markup
         * @returns {SafeHTML}
         */
        raw: (markup) => new SafeHTML(String(markup)),
    },
);

/**
 * Passes markup through a Trusted Types policy named "cyclewire" when the page
 * enforces Trusted Types (allow it with `trusted-types cyclewire`).
 * @param {string} markup
 * @returns {any}
 */
function trusted(markup) {
    const global = /** @type {any} */ (globalThis);
    if (!global.trustedTypes) return markup;
    if (!(POLICY in global)) {
        try {
            global[POLICY] = global.trustedTypes.createPolicy('cyclewire', { createHTML: (/** @type {string} */ s) => s });
        } catch {
            global[POLICY] = null;
        }
    }
    return global[POLICY] ? global[POLICY].createHTML(markup) : markup;
}

/**
 * Turns content into a DocumentFragment. SafeHTML is parsed through an inert
 * <template>: scripts do not run and images do not load until the fragment is
 * inserted, and inserted <script> elements never execute. Strings become text;
 * nodes are moved in as they are.
 *
 * @param {SafeHTML | Node | string | number | null | undefined} content
 * @returns {DocumentFragment}
 */
export function fragment(content) {
    if (content instanceof DocumentFragment) return content;
    if (isSafeHTML(content)) {
        const template = document.createElement('template');
        const markup = content.markup;
        const setHTMLUnsafe = /** @type {any} */ (template).setHTMLUnsafe;
        // Declarative shadow roots are only attached by the newer parser entry point.
        if (setHTMLUnsafe && markup.includes('shadowrootmode')) setHTMLUnsafe.call(template, trusted(markup));
        else template.innerHTML = trusted(markup);
        return template.content;
    }
    const frag = document.createDocumentFragment();
    if (content != null) frag.append(content instanceof Node ? content : String(content));
    return frag;
}

/** @typedef {'inner' | 'outer' | 'before' | 'after' | 'prepend' | 'append'} SwapMode */

/**
 * Puts content into the page in one operation. Focus and text selection
 * survive when the focused element is replaced by one with the same id.
 *
 * @param {Element} target
 * @param {SafeHTML | Node | string | number | null | undefined} content  plain strings are inserted as text
 * @param {SwapMode} [mode]
 */
export function swap(target, content, mode = 'inner') {
    const frag = fragment(content);
    const saved = snapshot();
    switch (mode) {
        case 'inner': target.replaceChildren(frag); break;
        case 'outer': target.replaceWith(frag); break;
        case 'before': target.before(frag); break;
        case 'after': target.after(frag); break;
        case 'prepend': target.prepend(frag); break;
        case 'append': target.append(frag); break;
        default: throw new TypeError(`[CycleWire] swap: unknown mode "${mode}"`);
    }
    restore(saved);
}

/**
 * Runs a DOM update inside a View Transition where supported, and directly
 * otherwise or when the user prefers reduced motion.
 * @param {() => unknown} update
 * @returns {Promise<void>} settles once the DOM has been updated
 */
export function transition(update) {
    const doc = /** @type {any} */ (document);
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return doc.startViewTransition(update).updateCallbackDone;
    }
    try {
        return Promise.resolve(update()).then(() => {});
    } catch (error) {
        return Promise.reject(error);
    }
}
