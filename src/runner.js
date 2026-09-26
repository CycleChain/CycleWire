import { concurrency, splitName } from './attrs.js';
import * as registry from './registry.js';
import { api, attrs, opts, plugins } from './state.js';
import { emit, trace, warn } from './util.js';

/**
 * The run pipeline: once, debounce, concurrency admission, abort signals,
 * pending state, module import, the handler call and lifecycle events.
 */

/** @typedef {import('./attrs.js').Concurrency} Concurrency */
/** @typedef {import('./index.js').Context} Context */

/**
 * Run state for one (element, action) binding.
 * @typedef {object} Binding
 * @property {AbortController | null} controller  the latest non-parallel run's controller
 * @property {number} running                     runs in flight
 * @property {boolean} done                       a cw-once run has succeeded
 * @property {[Event | null, EventTarget | null, (value: Promise<unknown> | undefined) => void] | null} queued  the one event `latest` holds back
 * @property {ReturnType<typeof setTimeout> | undefined} timer   debounce timer
 * @property {((value: undefined) => void) | null} settle        resolves a debounced call that got superseded
 */

/** @type {WeakMap<Element, Map<string, Binding>>} */
const bindings = new WeakMap();
/** @type {Set<{ el: Element, controller: AbortController }>} */
const live = new Set();
/** @type {WeakMap<Element, { count: number, pending: string | null, busy: string | null, setBusy: boolean }>} */
const pendingState = new WeakMap();
/** @type {Set<string>} */
const warned = new Set();

/**
 * Lets the browser paint (the pending state, a pressed button) before an
 * action runs synchronously off a cached module. A fresh import yields on its
 * own, so this only happens when the module is already in memory.
 * @returns {Promise<unknown>}
 */
function yieldToMain() {
    const scheduler = /** @type {any} */ (globalThis).scheduler;
    return scheduler && scheduler.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}

/** @param {Element} el @param {string} name @param {string | null} value */
function restoreAttr(el, name, value) {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
}

/** @param {Element} el @param {string} action @returns {Binding} */
function binding(el, action) {
    let map = bindings.get(el);
    if (!map) bindings.set(el, (map = new Map()));
    let state = map.get(action);
    if (!state) map.set(action, (state = { controller: null, running: 0, done: false, queued: null, timer: undefined, settle: null }));
    return state;
}

/**
 * `cw-pending` and `aria-busy` are reference counted, and whatever the server
 * rendered in their place is put back afterwards.
 * @param {Element} el @param {boolean} busy
 */
function pend(el, busy) {
    let state = pendingState.get(el);
    if (!state) {
        state = { count: 0, pending: el.getAttribute(attrs.pending), busy: el.getAttribute('aria-busy'), setBusy: busy };
        pendingState.set(el, state);
        el.setAttribute(attrs.pending, '');
        if (busy) el.setAttribute('aria-busy', 'true');
    }
    state.count++;
}

/** @param {Element} el */
function unpend(el) {
    const state = pendingState.get(el);
    if (!state || --state.count) return;
    pendingState.delete(el);
    restoreAttr(el, attrs.pending, state.pending);
    if (state.setBusy) restoreAttr(el, 'aria-busy', state.busy);
}

/**
 * The single context object every handler receives.
 * @param {Element} el @param {string} action @param {Event | null} event
 * @param {EventTarget | null} target @param {AbortSignal} signal
 * @returns {Context}
 */
function context(el, action, event, target, signal) {
    /** @type {any} */
    let props;
    let parsed = false;
    /** @type {Context} */
    const ctx = {
        event,
        target,
        element: el,
        signal,
        action,
        wire: api,
        get props() {
            if (!parsed) {
                parsed = true;
                const raw = el.getAttribute(attrs.props);
                try {
                    props = raw ? JSON.parse(raw) : null;
                } catch (error) {
                    throw new SyntaxError(`[CycleWire] ${attrs.props}: ${/** @type {Error} */ (error).message}`);
                }
            }
            return props;
        },
    };
    for (const plugin of plugins) plugin.context?.(ctx);
    return ctx;
}

/**
 * @param {Element} el @param {string} action @param {Event | null} event
 * @param {EventTarget | null} target @param {Concurrency} mode @param {Binding} state
 * @returns {Promise<unknown>}
 */
async function start(el, action, event, target, mode, state) {
    if (mode !== 'parallel') state.controller?.abort();
    const controller = new AbortController();
    if (mode !== 'parallel') state.controller = controller;
    const { signal } = controller;
    const run = { el, controller };
    live.add(run);
    state.running++;
    pend(el, mode === 'drop');
    const [name, exported] = splitName(action);
    const cached = registry.isReady(name);
    if (__DEV__) trace({ type: 'start', run, element: el, action, event, mode, cached });
    try {
        const found = registry.entry(name);
        if (__DEV__ && found && typeof found === 'object' && found.css && !plugins.some((plugin) => plugin.load) && !warned.has(`css ${name}`)) {
            warned.add(`css ${name}`);
            warn(`Action "${name}" lists css, but no plugin loads stylesheets. Add styles() from cyclewire/css to your plugins.`);
        }
        // Plugins load what else the action needs (its stylesheets, say) in
        // parallel with the module; the handler waits for all of it.
        const [mod] = await Promise.all([registry.load(name), ...plugins.map((plugin) => plugin.load?.(found, el, name))]);
        if (cached) await yieldToMain();
        if (signal.aborted) {
            if (__DEV__) trace({ type: 'end', run, status: 'aborted' });
            return undefined;
        }
        const handler = exported ? mod[exported] : mod.run || mod.default;
        if (typeof handler !== 'function') throw new TypeError(`[CycleWire] "${action}" is not a function export`);
        if (__DEV__ && handler.length > 1 && !warned.has(action)) {
            warned.add(action);
            warn(`Action "${action}" declares ${handler.length} parameters. Handlers receive one context object: ({ event, element, signal, ... }).`);
        }
        const result = await handler(context(el, action, event, target, signal));
        if (el.hasAttribute(attrs.once)) state.done = true;
        if (__DEV__) trace({ type: 'end', run, status: 'done' });
        emit(el, 'done', { action, result });
        return result;
    } catch (error) {
        // Our own cancellation is not a failure.
        if (signal.aborted && (error === signal.reason || /** @type {any} */ (error)?.name === 'AbortError')) {
            if (__DEV__) trace({ type: 'end', run, status: 'aborted' });
            return undefined;
        }
        if (__DEV__) trace({ type: 'end', run, status: 'error', error });
        emit(el, 'error', { action, error });
        if (opts.onError) opts.onError(error, { action, element: el, event });
        else console.error(`[CycleWire] "${action}" failed:`, error);
        throw error;
    } finally {
        live.delete(run);
        state.running--;
        unpend(el);
        const queued = state.queued;
        if (queued && !state.running) {
            state.queued = null;
            queued[2](el.isConnected ? start(el, action, queued[0], queued[1], 'latest', state) : undefined);
        }
    }
}

/**
 * @param {Element} el @param {string} action @param {Event | null} event
 * @param {EventTarget | null} target @param {Concurrency} mode @param {Binding} state
 * @returns {Promise<unknown>}
 */
function admit(el, action, event, target, mode, state) {
    if (state.running) {
        if (mode === 'drop') {
            if (__DEV__) trace({ type: 'skip', element: el, action, event, reason: 'busy' });
            return Promise.resolve();
        }
        if (mode === 'latest') {
            if (__DEV__) trace({ type: 'queue', element: el, action, event });
            state.queued?.[2](undefined);
            return new Promise((resolve) => {
                state.queued = [event, target, resolve];
            });
        }
    }
    return start(el, action, event, target, mode, state);
}

/**
 * Fires the cancelable `cw:run` event.
 * @param {Element} el @param {string} action @param {Event | null} event
 * @returns {boolean} false when a listener cancelled the run
 */
export const announce = (el, action, event) => emit(el, 'run', { action, event }, true);

/**
 * Runs `action` for `el`, honouring once, debounce and concurrency. Resolves
 * `undefined` when the run is dropped, superseded or aborted, and rejects when
 * the handler or the module import fails.
 * @param {Element} el @param {string} action @param {Event | null} event
 * @param {EventTarget | null} target @param {string | null} type
 * @returns {Promise<unknown>}
 */
export function dispatch(el, action, event, target, type) {
    const state = binding(el, action);
    const once = el.hasAttribute(attrs.once);
    if (once && state.done) {
        if (__DEV__) trace({ type: 'skip', element: el, action, event, reason: 'once' });
        return Promise.resolve();
    }
    const mode = once ? 'drop' : concurrency(el.getAttribute(attrs.concurrency), type);
    const wait = Number(el.getAttribute(attrs.debounce)) || 0;
    if (wait <= 0) return admit(el, action, event, target, mode, state);
    if (__DEV__) trace({ type: 'debounce', element: el, action, event, wait });

    clearTimeout(state.timer);
    state.settle?.(undefined);
    // Under `restart`, stale work stops the moment new input arrives, not
    // when the debounce expires.
    if (mode === 'restart' && state.running) state.controller?.abort();
    return new Promise((resolve) => {
        state.settle = resolve;
        state.timer = setTimeout(() => {
            state.settle = null;
            resolve(el.isConnected ? admit(el, action, event, target, mode, state) : undefined);
        }, wait);
    });
}

/** Aborts runs whose element has left the document. */
export function abortDetached() {
    for (const run of live) if (!run.el.isConnected) run.controller.abort();
}

export function abortAll() {
    for (const run of live) run.controller.abort();
}
