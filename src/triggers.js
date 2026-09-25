import { actionsOf, splitName } from './attrs.js';
import { attach, detach } from './delegate.js';
import * as registry from './registry.js';
import { abortDetached, announce, dispatch } from './runner.js';
import { attrs, opts, plugins, started } from './state.js';
import { noop, saveData, warn } from './util.js';

/**
 * Event-less activation (`data-cw-trigger`), scheduled preloads
 * (`data-cw-preload`) and the MutationObservers that pick up content added
 * after start, whether a framework, `swap()` or `morph()` inserted it.
 */

/** Elements whose trigger is scheduled or spent. Moving a node never re-runs it. */
let activated = new WeakSet();
/** Elements whose scheduled preload is set up. */
let preloaded = new WeakSet();
/** Bumped by stopTriggers(), so work scheduled earlier never fires after a restart. */
let generation = 0;
/** @type {IntersectionObserver | null} */
let io = null;
/** @type {Map<Element, (() => void)[]>} */
const visible = new Map();
/** @type {Map<Node, MutationObserver>} */
const observers = new Map();
/** Trigger runs waiting for their action to be registered. @type {[Element, string][]} */
let waiting = [];
/** Work held back while the page is prerendered. @type {(() => void)[]} */
let held = [];

/** Nothing speculative runs in a prerendered page nobody has looked at yet. */
function gate(/** @type {() => void} */ fn) {
    if (!(/** @type {any} */ (document).prerendering)) return fn();
    if (!held.length) {
        document.addEventListener('prerenderingchange', () => {
            const queue = held;
            held = [];
            queue.forEach((task) => task());
        }, { once: true });
    }
    held.push(fn);
}

/** @param {() => void} fn */
function idle(fn) {
    const schedule = () => {
        const ric = /** @type {any} */ (globalThis).requestIdleCallback;
        // Safari has no requestIdleCallback.
        if (ric) ric(fn, { timeout: opts.idleTimeout });
        else setTimeout(fn, 200);
    };
    if (document.readyState === 'complete') schedule();
    else addEventListener('load', schedule, { once: true });
}

/** @param {Element} el @param {() => void} fn */
function whenVisible(el, fn) {
    if (!('IntersectionObserver' in globalThis)) return fn();
    io ||= new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const callbacks = visible.get(entry.target);
            io?.unobserve(entry.target);
            visible.delete(entry.target);
            callbacks?.forEach((callback) => callback());
        }
    }, { rootMargin: opts.rootMargin });
    const callbacks = visible.get(el);
    if (callbacks) callbacks.push(fn);
    else {
        visible.set(el, [fn]);
        io.observe(el);
    }
}

/**
 * @param {Element} el
 * @param {string} when load | idle | visible | media:(query)
 * @param {() => void} fn
 */
function schedule(el, when, fn) {
    if (when === 'load') return fn();
    if (when === 'idle') return idle(fn);
    if (when === 'visible') return whenVisible(el, fn);
    if (when.startsWith('media:')) {
        const query = matchMedia(when.slice(6).trim());
        if (query.matches) return fn();
        const onChange = () => {
            if (!query.matches) return;
            query.removeEventListener('change', onChange);
            fn();
        };
        return query.addEventListener('change', onChange);
    }
    if (__DEV__) warn(`Unknown trigger "${when}". Use load, idle, visible or media:(query).`, el);
}

/** @param {Element} el @param {string} action */
function fire(el, action) {
    if (!started || !el.isConnected) return;
    if (!registry.has(action)) {
        waiting.push([el, action]);
        return;
    }
    if (announce(el, action, null)) dispatch(el, action, null, el, null).catch(noop);
}

/** @param {Element} el */
function setup(el) {
    const current = generation;
    const trigger = el.getAttribute(attrs.trigger);
    if (trigger && !activated.has(el)) {
        activated.add(el);
        const action = el.getAttribute(attrs.action)?.trim();
        if (action) gate(() => schedule(el, trigger.trim(), () => current === generation && fire(el, action)));
        else if (__DEV__) warn(`${attrs.trigger} needs a ${attrs.action} on the same element.`, el);
    }
    const preload = el.getAttribute(attrs.preload)?.trim();
    if (preload && preload !== 'intent' && preload !== 'none' && !preloaded.has(el)) {
        preloaded.add(el);
        gate(() => schedule(el, preload, () => {
            if (current !== generation || saveData()) return;
            for (const name of actionsOf(el, attrs)) registry.preload(splitName(name)[0]);
        }));
    }
}

/**
 * Activates the triggers and scheduled preloads in `root` (root included),
 * then lets plugins look at the same subtree.
 * @param {ParentNode} root
 */
export function scan(root) {
    const selector = `[${attrs.trigger}],[${attrs.preload}]`;
    if (/** @type {Node} */ (root).nodeType === 1 && /** @type {Element} */ (root).matches(selector)) setup(/** @type {Element} */ (root));
    for (const el of root.querySelectorAll(selector)) setup(el);
    if (opts.shadow) {
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) observe(el.shadowRoot);
    }
    for (const plugin of plugins) plugin.scan?.(root);
}

/** @param {Node} root */
export function watch(root) {
    if (!opts.mutations || observers.has(root)) return;
    const observer = new MutationObserver((records) => {
        let removed = false;
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === 1 && node.isConnected) scan(/** @type {Element} */ (node));
            }
            if (record.removedNodes.length) removed = true;
        }
        if (!removed) return;
        // Clean up after removals: abort orphaned runs, stop observing detached nodes.
        abortDetached();
        for (const el of [...visible.keys()]) {
            if (el.isConnected) continue;
            io?.unobserve(el);
            visible.delete(el);
        }
    });
    observer.observe(root, { childList: true, subtree: true });
    observers.set(root, observer);
}

/**
 * Delegates events inside `root`, watches it and activates its triggers.
 * @param {Node & ParentNode} root
 * @returns {() => void}
 */
export function observe(root) {
    attach(root);
    watch(root);
    scan(root);
    return () => {
        detach(root);
        observers.get(root)?.disconnect();
        observers.delete(root);
    };
}

/** Starts the trigger runs that were waiting for `register()`. */
export function retry() {
    const pending = waiting;
    waiting = [];
    for (const [el, action] of pending) fire(el, action);
}

/** Tears everything down; a later start() activates the page afresh. */
export function stopTriggers() {
    generation++;
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    io?.disconnect();
    io = null;
    visible.clear();
    waiting = [];
    held = [];
    activated = new WeakSet();
    preloaded = new WeakSet();
}
