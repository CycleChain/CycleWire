/**
 * cyclewire/request — links, forms and buttons that ask your server for HTML
 * and put it into the page, declared in markup:
 *
 *   start({ actions: { request: () => import('cyclewire/request') } });
 *
 *   <form action="/subscribe" method="post" cw-action="request" cw-swap="outer">…</form>
 *   <button cw-action="request" cw-get="/products?page=2" cw-target="#grid" cw-swap="append">More</button>
 *   <input type="search" name="q" cw-on-input="request" cw-get="/search" cw-target="#results" cw-debounce="150">
 *
 * It is an action like any other: its code arrives the first time someone
 * reaches for such an element, and each request runs with the element's
 * concurrency, debounce, pending state and trigger. Requests go to the page's
 * own origin only. The response is parsed inertly, so scripts in it never
 * run, and the <cw-stream> messages at its top level are applied.
 *
 * Morph and the message applier come with it, not with the first answer that
 * needs them: that answer would otherwise wait a round trip for their code.
 */
import { fragment, SafeHTML, swap, transition } from './dom.js';
import { morph } from './morph.js';
import { apply } from './stream.js';

/** The methods an attribute can name: `cw-get`, `cw-post`, … */
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Throws unless a URL is on the page's own origin: markup never sends the
 * page's data to another site, nor puts another site's HTML into it.
 * @param {string} href
 */
function own(href) {
    if (new URL(href).origin !== location.origin) throw new Error(`[CycleWire] request: ${href} is not on this page's origin`);
}

/**
 * The element `cw-target` names: none, the element itself; `closest …`, its
 * nearest ancestor that matches; anything else, the first match in the
 * element's document or shadow root.
 * @param {Element} el @param {string | null} selector
 * @returns {Element}
 */
function find(el, selector) {
    const text = selector?.trim();
    if (!text) return el;
    const closest = /^closest\s+(.+)/.exec(text);
    const found = closest ? el.closest(closest[1]) : /** @type {ParentNode} */ (el.getRootNode()).querySelector(text);
    if (!found) throw new Error(`[CycleWire] request: nothing matches ${text}`);
    return found;
}

/**
 * The action. The method and URL come from `cw-get`, `cw-post`, `cw-put`,
 * `cw-patch` or `cw-delete`; with an empty value, or without one, from the
 * element: a submit button's formaction, a link's href, a form's action and
 * method. A form sends its fields, and so does anything inside one; a field
 * on its own sends its name and value. GET puts them in the query string.
 * @param {import('./index.js').Context} context
 * @returns {Promise<void>}
 */
export async function run({ element, event, signal, action, fetch: get = fetch }) {
    const el = /** @type {any} */ (element);
    // The prefix start() was given, read off the attribute that bound the action.
    let prefix = 'cw-';
    for (const name of el.getAttributeNames()) {
        const bound = /^(.*?)(?:action|on-[\w-]+)$/.exec(name);
        if (bound && el.getAttribute(name).trim() === action) prefix = bound[1];
    }
    /** @param {string} name */
    const at = (name) => el.getAttribute(prefix + name);

    // Where the answer goes, and which part of it, settled before anything is sent.
    const target = find(el, at('target'));
    const [mode, ...flags] = (at('swap') || 'inner').trim().split(/\s+/);
    const select = at('select');
    if (select) document.createDocumentFragment().querySelector(select);

    /** @type {HTMLFormElement | null} */
    const form = el.localName === 'form' ? el : el.form;
    const submitter = /** @type {any} */ (event)?.submitter || (form && /^(submit|image)$/.test(el.type) ? el : null);
    const via = submitter || el;
    // Attributes, not form.action and form.method: a field named "action" hides those.
    const method = METHODS.find((name) => at(name) !== null) || (via.getAttribute('formmethod') || form?.getAttribute('method') || 'get').toLowerCase();
    const url = new URL(at(method) || via.getAttribute('formaction') || el.href || form?.getAttribute('action') || location.href, document.baseURI);
    const data = form ? new FormData(form, submitter) : new FormData();
    if (!form && el.name && el.value != null && (!/^(checkbox|radio)$/.test(el.type) || el.checked)) data.append(el.name, el.value);

    /** @type {RequestInit} */
    const init = { signal };
    if (method === 'get') {
        for (const [name, value] of data) if (typeof value === 'string') url.searchParams.append(name, value);
    } else {
        init.method = method.toUpperCase();
        init.body = (via.getAttribute('formenctype') || form?.getAttribute('enctype')) === 'multipart/form-data' ? data : new URLSearchParams(/** @type {any} */ (data));
        // Rails and Laravel read their CSRF token from this header.
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (token) init.headers = { 'X-CSRF-Token': token };
    }
    own(url.href);
    // A plain GET goes through ctx.fetch, which takes a response cw-prefetch started.
    const response = await get(url.href, init);
    // A redirect may have led elsewhere.
    own(response.url || url.href);
    // 422 is a form sent back with its errors, to show like any answer.
    if (!response.ok && response.status !== 422) throw new Error(`[CycleWire] request: ${init.method || 'GET'} ${url.href} answered ${response.status}`);
    // No Content leaves the page as it is, but for a target to remove.
    if (response.status === 204 && mode !== 'remove') return;

    const content = fragment(new SafeHTML(await response.text()));
    // A newer run took over while this one was reading its answer.
    if (signal.aborted) throw signal.reason;
    const messages = [...content.children].filter((child) => child.localName === 'cw-stream');
    for (const message of messages) message.remove();
    let chosen = content;
    if (select) {
        chosen = document.createDocumentFragment();
        chosen.append(...content.querySelectorAll(select));
    }
    const change = () => {
        if (mode === 'morph') {
            // New markup for the target itself is morphed onto it; anything else becomes its children.
            const only = chosen.children.length === 1 && chosen.firstElementChild;
            morph(target, chosen, { children: !(only && only.id && only.id === target.id) });
        } else if (mode === 'remove') target.remove();
        else if (mode !== 'none') swap(target, chosen, /** @type {import('./dom.js').SwapMode} */ (mode));
    };
    if (flags.includes('transition')) await transition(change);
    else change();
    if (messages.length) {
        const rest = document.createDocumentFragment();
        rest.append(...messages);
        await apply(rest);
    }
}
