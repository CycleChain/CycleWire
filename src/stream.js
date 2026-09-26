/**
 * cyclewire/stream — the server changes the page with small HTML messages,
 * sent over Server-Sent Events or in the body of any response:
 *
 *   <cw-stream op="append" target="messages"><template><li>Hello</li></template></cw-stream>
 *
 *   import { apply, connect } from 'cyclewire/stream';
 *   const close = connect('/events');                    // applies every message the stream sends
 *   await apply(html.raw(await response.text()));      // applies the messages in a response
 *
 * A message names what to change (`target`, an id, or `targets`, a selector)
 * and how (`op`); its <template> holds the new content, parsed inertly, so
 * scripts in it never run. <cw-stream> is not a custom element: markup that
 * reaches the page any other way does nothing.
 */
import { fragment, isSafeHTML, SafeHTML, swap, transition } from './dom.js';
import { morph } from './morph.js';
import { warn } from './util.js';

const OPS = /^(?:append|prepend|before|after|inner|outer|morph|remove)$/;
const MAX_DELAY = 30000;

/**
 * What a `cw:stream` event carries. Cancel the event to skip the message;
 * change `content` to change what goes in.
 * @typedef {object} StreamDetail
 * @property {string} op
 * @property {Element[]} targets
 * @property {DocumentFragment} content
 * @property {string | null} source  the stream's URL, or null for apply()
 */

/** The attribute prefix, as the plugin learns it from start(). */
let prefix = 'cw-';

/**
 * Applies one message.
 * @param {Element} message
 * @param {ParentNode} root
 * @param {string | null} source
 * @returns {Promise<void>}
 */
function one(message, root, source) {
    const op = message.getAttribute('op') || '';
    const id = message.getAttribute('target');
    const selector = message.getAttribute('targets');
    /** @type {Element[]} */
    let targets = [];
    try {
        const found = id ? root.querySelector(`#${CSS.escape(id)}`) : null;
        targets = selector !== null ? [...root.querySelectorAll(selector)] : found ? [found] : [];
    } catch (error) {
        if (__DEV__) warn(`<cw-stream targets="${selector}"> is not a valid selector.`, error);
    }
    if (!OPS.test(op) || !targets.length) {
        if (__DEV__) warn(OPS.test(op) ? `<cw-stream> found nothing to change: ${id !== null ? `no element with id "${id}"` : `nothing matches "${selector}"`}.` : `<cw-stream op="${op}"> is not an operation. Use append, prepend, before, after, inner, outer, morph or remove.`);
        return Promise.resolve();
    }
    const template = message.querySelector('template');
    /** @type {StreamDetail} */
    const detail = { op, targets, content: template ? template.content : document.createDocumentFragment(), source };
    if (!targets[0].dispatchEvent(new CustomEvent('cw:stream', { bubbles: true, composed: true, cancelable: true, detail }))) return Promise.resolve();
    const change = () => {
        targets.forEach((target, i) => {
            // Every target but the last gets a copy.
            const content = /** @type {DocumentFragment} */ (i < targets.length - 1 ? detail.content.cloneNode(true) : detail.content);
            if (op === 'remove') target.remove();
            else if (op !== 'morph') swap(target, content, /** @type {import('./dom.js').SwapMode} */ (op));
            else {
                // New markup for the target itself is morphed onto it; anything else becomes its children.
                const only = content.children.length === 1 && content.firstElementChild;
                morph(target, content, { children: !(only && only.id && only.id === target.id) });
            }
        });
    };
    if (message.hasAttribute('transition')) return transition(change);
    change();
    return Promise.resolve();
}

/**
 * Applies the <cw-stream> messages in trusted server markup, in order.
 * @param {SafeHTML} content  mark your server's markup with `html.raw()`; plain strings are refused
 * @param {{ root?: ParentNode, source?: string | null }} [options]  `root`: where targets are looked up, the document by default
 * @returns {Promise<void>} settles once every change is in place
 */
export function apply(content, { root = document, source = null } = {}) {
    if (!isSafeHTML(content)) throw new TypeError('[CycleWire] apply() takes SafeHTML: mark trusted server markup with html.raw(markup)');
    const messages = [...fragment(content).querySelectorAll('cw-stream')].filter((message) => !message.parentElement?.closest('cw-stream'));
    return Promise.all(messages.map((message) => one(message, root, source))).then(() => {});
}

/**
 * One EventSource per URL, shared by every subscription to it.
 * @typedef {object} Connection
 * @property {string} key
 * @property {string} url
 * @property {boolean} credentials
 * @property {EventSource | null} source
 * @property {Set<Subscription>} subscriptions
 * @property {string} last       the last event id seen
 * @property {number} delay      the wait before reconnecting after the browser gave up
 * @property {ReturnType<typeof setTimeout> | undefined} timer
 * @property {'connecting' | 'open'} state
 */

/** @typedef {{ root: ParentNode, element?: Element, close: () => void }} Subscription */

/** @type {Map<string, Connection>} */
const connections = new Map();
/** Elements that close their subscriptions when they leave the page. @type {Set<Subscription>} */
const tracked = new Set();
/** @type {MutationObserver | null} */
let watcher = null;
let listening = false;

const base = () => prefix || 'data-';
const stateAttr = () => `${base()}stream-state`;

/** @param {Connection} connection @param {'connecting' | 'open'} state */
function setState(connection, state) {
    connection.state = state;
    for (const { element } of connection.subscriptions) element?.setAttribute(stateAttr(), state);
}

/** Closes the subscriptions whose element has left the page. */
function prune() {
    for (const subscription of tracked) if (!subscription.element?.isConnected) subscription.close();
}

/** @param {Connection} connection */
function open(connection) {
    if (connection.source || connection.timer !== undefined || !connection.subscriptions.size) return;
    // A prerendered page nobody has looked at yet opens nothing.
    if (/** @type {any} */ (document).prerendering) {
        document.addEventListener('prerenderingchange', () => open(connection), { once: true });
        return;
    }
    const url = new URL(connection.url);
    // Reconnecting on our own, not the browser's: say where the stream left off.
    if (connection.last && connection.delay) url.searchParams.set('last-event-id', connection.last);
    const source = new EventSource(url, { withCredentials: connection.credentials });
    connection.source = source;
    setState(connection, 'connecting');
    source.onopen = () => {
        connection.delay = 0;
        setState(connection, 'open');
    };
    source.onmessage = (event) => {
        if (event.lastEventId) connection.last = event.lastEventId;
        prune();
        const content = new SafeHTML(event.data);
        for (const root of new Set([...connection.subscriptions].map((subscription) => subscription.root))) apply(content, { root, source: connection.url });
    };
    source.onerror = () => {
        setState(connection, 'connecting');
        // While CONNECTING, the browser retries by itself and sends Last-Event-ID; once CLOSED it has given up.
        if (source.readyState !== EventSource.CLOSED) return;
        source.close();
        connection.source = null;
        connection.delay = Math.min(MAX_DELAY, (connection.delay || 500) * 2);
        connection.timer = setTimeout(() => {
            connection.timer = undefined;
            open(connection);
        }, connection.delay * (0.75 + Math.random() / 2));
    };
}

/** @param {Connection} connection */
function shut(connection) {
    connection.source?.close();
    connection.source = null;
    clearTimeout(connection.timer);
    connection.timer = undefined;
}

/**
 * Opens a stream, or joins the one already open for the same URL, and
 * applies every message it sends. Messages are the default event
 * (no `event:` field); their `id` lets a reconnection pick up where the
 * stream left off. The connection closes when its last subscriber leaves.
 * @param {string | URL} url  resolved against the page
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]      closes this subscription
 * @param {Element} [options.element]         closes it when the element leaves the page, and shows the connection's state in its `cw-stream-state`
 * @param {ParentNode} [options.root]         where targets are looked up, the document by default
 * @param {boolean} [options.withCredentials] sends cookies to another origin
 * @returns {() => void} closes this subscription
 */
export function connect(url, { signal, element, root = document, withCredentials = false } = {}) {
    const href = new URL(url, document.baseURI).href;
    const key = `${withCredentials} ${href}`;
    let connection = connections.get(key);
    if (!connection) {
        connection = { key, url: href, credentials: withCredentials, source: null, subscriptions: new Set(), last: '', delay: 0, timer: undefined, state: 'connecting' };
        connections.set(key, connection);
    }
    if (!listening) {
        listening = true;
        // Open connections keep a page out of the back/forward cache: close them, and reopen on return.
        addEventListener('pagehide', (event) => {
            if (event.persisted) connections.forEach(shut);
        });
        addEventListener('pageshow', (event) => {
            if (event.persisted) connections.forEach(open);
        });
    }
    const joined = connection;
    /** @type {Subscription} */
    const subscription = {
        root,
        element,
        close() {
            if (!joined.subscriptions.delete(subscription)) return;
            tracked.delete(subscription);
            element?.setAttribute(stateAttr(), 'closed');
            if (!tracked.size) {
                watcher?.disconnect();
                watcher = null;
            }
            if (!joined.subscriptions.size) {
                shut(joined);
                connections.delete(joined.key);
            }
        },
    };
    joined.subscriptions.add(subscription);
    if (element) {
        element.setAttribute(stateAttr(), joined.state);
        tracked.add(subscription);
        watcher ||= new MutationObserver(prune);
        watcher.observe(document, { childList: true, subtree: true });
    }
    if (signal?.aborted) subscription.close();
    else signal?.addEventListener('abort', subscription.close, { once: true });
    open(joined);
    return subscription.close;
}

/**
 * The plugin behind `cw-stream="<channel>"`: while such an element is in
 * the page, it is subscribed to the channel's stream. Channels map names to
 * same-origin URLs, or to functions that build one from the element, so
 * markup can only open the streams you list.
 * @param {{ channels?: Record<string, string | ((element: Element) => string)> }} [options]
 * @returns {import('./index.js').Plugin}
 */
export function streams({ channels = {} } = {}) {
    /** @type {WeakMap<Element, () => void>} */
    const open = new WeakMap();
    /** @type {Set<() => void>} */
    const all = new Set();
    return {
        setup(info) {
            prefix = info.prefix;
        },
        scan(root) {
            const attr = `${base()}stream`;
            const found = /** @type {Element[]} */ ([...root.querySelectorAll(`[${attr}]`)]);
            if (/** @type {Node} */ (root).nodeType === 1 && /** @type {Element} */ (root).matches(`[${attr}]`)) found.unshift(/** @type {Element} */ (root));
            for (const el of found) {
                if (open.has(el) && el.hasAttribute(stateAttr()) && el.getAttribute(stateAttr()) !== 'closed') continue;
                // Injected markup must not open streams.
                if (el.closest(`[${base()}ignore]`)) continue;
                const name = /** @type {string} */ (el.getAttribute(attr)).trim();
                const channel = Object.prototype.hasOwnProperty.call(channels, name) ? channels[name] : null;
                const url = channel && new URL(typeof channel === 'function' ? channel(el) : channel, document.baseURI);
                if (!url || url.origin !== location.origin) {
                    if (__DEV__) warn(url ? `Stream channel "${name}" points to another origin; markup can only open same-origin streams.` : `No stream channel is named "${name}". Add it to streams({ channels }).`, el);
                    continue;
                }
                const close = connect(url, { element: el, root: /** @type {ParentNode} */ (el.getRootNode()) });
                open.set(el, close);
                all.add(close);
            }
        },
        stop() {
            all.forEach((close) => close());
            all.clear();
        },
    };
}
