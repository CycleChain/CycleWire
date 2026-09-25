import { actionsOf, defaultEvent, isPassive, NON_BUBBLING, splitName } from './attrs.js';
import * as registry from './registry.js';
import { announce, dispatch } from './runner.js';
import { attrs, opts, types } from './state.js';
import { noop, saveData, warn } from './util.js';

/**
 * One listener per event type and root (the document, or a shadow root given
 * to `observe()`). It finds the element an event is bound to, decides about
 * preventDefault synchronously, and hands the run to the runner.
 */

/** Events that hint the user is about to interact: time to fetch the module. */
const INTENT = ['pointerover', 'focusin', 'pointerdown'];

/** @type {Map<Node, Map<string, [EventListener, boolean]>>} */
const roots = new Map();
/** @type {Map<string, { capture?: boolean, passive?: boolean }>} */
const overrides = new Map();
/** Events a root already handled, so an outer root leaves them alone. */
const handled = new WeakSet();
/** @type {WeakSet<Element>} */
const warnedFocus = new WeakSet();

const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable],[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[role=option]';

/** @param {Element} el */
const isDisabled = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';

/**
 * The innermost element bound to this event type, `false` when that element
 * is disabled (the event is swallowed), or null. Stops at the listener's root
 * and at `data-cw-ignore`.
 * @param {Event} event @param {Node} root @param {string} type
 * @returns {[Element, string] | false | null}
 */
function resolve(event, root, type) {
    const path = event.composedPath();
    const on = attrs.on + type;
    const end = NON_BUBBLING.has(type) ? Math.min(path.length, 1) : path.length;
    for (let i = 0; i < end; i++) {
        const node = /** @type {Node} */ (path[i]);
        if (node === root) break;
        if (node.nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        if (el.hasAttribute(attrs.ignore)) return null;
        let action = el.getAttribute(on);
        if (action === null && el.hasAttribute(attrs.action) && !el.hasAttribute(attrs.trigger) && defaultEvent(el) === type) {
            action = el.getAttribute(attrs.action);
        }
        if (action && (action = action.trim())) return isDisabled(el) ? false : [el, action];
    }
    return null;
}

/** @param {Element} el @param {string} type */
function shouldPrevent(el, type) {
    const value = el.getAttribute(attrs.prevent);
    if (value !== null) {
        const listed = value.trim();
        return value !== 'none' && (!listed || listed.split(/\s+/).includes(type));
    }
    if (type === 'submit') return true;
    if (type !== 'click') return false;
    if (el.localName === 'a') return el.getAttribute('href') === '#';
    const control = /** @type {HTMLButtonElement | HTMLInputElement} */ (el);
    return (el.localName === 'button' || el.localName === 'input')
        && (control.type === 'submit' || control.type === 'image')
        && !!control.form;
}

/** @param {Event} event @param {Node} root @param {string} type */
function onEvent(event, root, type) {
    if (handled.has(event)) return;
    const found = resolve(event, root, type);
    if (found === null) return;
    handled.add(event);
    if (!found) return;

    const [el, action] = found;
    if (!registry.has(action)) {
        // Links and forms fall back to what the browser would do anyway.
        if (__DEV__) warn(`No action registered as "${action}"; the ${type} is left to the browser.`, el);
        return;
    }
    const prevent = shouldPrevent(el, type);
    const mouse = /** @type {MouseEvent} */ (event);
    // "Open in new tab" and friends keep working on clicks CycleWire prevents.
    if (prevent && type === 'click' && (mouse.button > 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)) return;
    // Captured now: after dispatch, event.target is null for shadow DOM events.
    const target = event.composedPath()[0] || event.target;
    if (!announce(el, action, event)) return;
    if (prevent) event.preventDefault();
    if (__DEV__ && type === 'click' && !warnedFocus.has(el) && !el.matches(INTERACTIVE)) {
        warnedFocus.add(el);
        warn(`<${el.localName}> handles clicks but cannot be focused, so keyboard users cannot reach it. Use a <button>, or add tabindex and a key binding.`, el);
    }
    dispatch(el, action, event, target, type).catch(noop);
}

/** Preloads the modules bound on the element the user is heading for. */
function onIntent(/** @type {Event} */ event) {
    for (const node of event.composedPath()) {
        if (/** @type {Node} */ (node).nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        const names = actionsOf(el, attrs);
        if (!names.length) continue;
        const mode = el.getAttribute(attrs.preload);
        if ((!mode || mode === 'intent') && !saveData()) {
            for (const name of names) registry.preload(splitName(name)[0]);
        }
        return;
    }
}

/** @param {Node} root @param {string} type */
function add(root, type) {
    const listeners = roots.get(root);
    if (!listeners || listeners.has(type)) return;
    const options = overrides.get(type) || {};
    const capture = options.capture ?? (opts.capture || NON_BUBBLING.has(type));
    /** @type {EventListener} */
    const listener = (event) => onEvent(event, root, type);
    root.addEventListener(type, listener, { capture, passive: options.passive ?? isPassive(type) });
    listeners.set(type, [listener, capture]);
}

/** @param {Node} root */
export function attach(root) {
    if (roots.has(root)) return;
    roots.set(root, new Map());
    for (const type of types) add(root, type);
    for (const type of INTENT) root.addEventListener(type, onIntent, { capture: true, passive: true });
}

/** @param {Node} root */
export function detach(root) {
    const listeners = roots.get(root);
    if (!listeners) return;
    for (const [type, [listener, capture]] of listeners) root.removeEventListener(type, listener, capture);
    for (const type of INTENT) root.removeEventListener(type, onIntent, true);
    roots.delete(root);
}

export function detachAll() {
    for (const root of [...roots.keys()]) detach(root);
}

/**
 * @param {Iterable<string>} list
 * @param {{ capture?: boolean, passive?: boolean }} [options]
 */
export function listen(list, options) {
    for (const type of list) {
        types.add(type);
        if (options) overrides.set(type, options);
        for (const root of roots.keys()) add(root, type);
    }
}
