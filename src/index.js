/**
 * CycleWire — zero-initial-JS selective activation engine.
 *
 * The server renders complete HTML. CycleWire adds one delegated listener per
 * event type and imports an action module only when the user reaches for it,
 * when its element scrolls into view, or when the browser is idle. Nothing is
 * hydrated and no component is re-rendered on boot.
 */
import { splitName } from './attrs.js';
import { attach, detachAll, listen as delegateTypes } from './delegate.js';
import * as registry from './registry.js';
import { abortAll, announce, dispatch } from './runner.js';
import { api, opts, plugins, setPrefix, setStarted, started, types } from './state.js';
import * as triggers from './triggers.js';
import { warn } from './util.js';

/** @typedef {import('./registry.js').ActionEntry} ActionEntry */
/** @typedef {import('./registry.js').ModuleEntry} ModuleEntry */
/** @typedef {import('./registry.js').EntryWithOptions} EntryWithOptions */
/** @typedef {import('./registry.js').ActionMap} ActionMap */
/** @typedef {import('./attrs.js').Concurrency} Concurrency */

/**
 * What every action handler receives.
 * @typedef {object} Context
 * @property {Event | null} event          the triggering event; null for triggers and run()
 * @property {EventTarget | null} target   the innermost event target, captured during dispatch
 * @property {Element} element             the element carrying the binding
 * @property {AbortSignal} signal          aborted when a newer run supersedes this one, when the element is removed, or on stop()
 * @property {any} props                   parsed `data-cw-props` JSON; null when absent
 * @property {string} action               the action name, e.g. "cart#add"
 * @property {Wire} wire                   the CycleWire API
 * @property {any} [state]                 the element's reactive scope (signals plugin)
 * @property {(name: string, init?: object) => any} [store]  a named reactive store (signals plugin)
 */

/**
 * @callback Action
 * @param {Context} context
 * @returns {unknown}
 */

/**
 * @typedef {object} RunInfo
 * @property {string} action
 * @property {Element} element
 * @property {Event | null} event
 */

/**
 * @typedef {object} Plugin
 * @property {(info: { prefix: string, wire: Wire }) => void} [setup]  called once, when the plugin is added
 * @property {(context: Context) => void} [context]  may add fields to every action context
 * @property {(root: ParentNode) => void} [scan]  sees every subtree CycleWire scans: start, observe, added content
 * @property {(entry: ActionEntry, name: string) => void} [preload]  fetch what else an action needs, ahead of time
 * @property {(entry: ActionEntry | undefined, element: Element, name: string) => unknown} [load]  runs with the module import; the handler waits for the promise it returns
 * @property {() => void} [stop]
 */

/**
 * @typedef {object} Options
 * @property {string} [prefix]         attribute prefix, as in `data-${prefix}action`. Default "cw-"; "" leaves the attributes unprefixed
 * @property {ActionMap} [actions]     actions to register
 * @property {string[]} [events]       extra event types to delegate
 * @property {boolean} [capture]       delegate every event in the capture phase
 * @property {string} [rootMargin]     IntersectionObserver margin for `visible`. Default "120px"
 * @property {number} [idleTimeout]    requestIdleCallback timeout for `idle`, in ms. Default 2000
 * @property {boolean} [mutations]     watch for added and removed content. Default true
 * @property {boolean} [shadow]        observe the open shadow roots found while scanning (declarative shadow DOM)
 * @property {'auto' | 'intent' | 'visible'} [preload]  what fetches the modules of elements without `data-cw-preload`
 *     besides intent. "auto" (default): on screens that cannot hover, nearing the viewport once the page is idle;
 *     "visible": the same on every screen; "intent": nothing else
 * @property {(error: unknown, info: RunInfo) => void} [onError]  replaces the default console.error
 * @property {Plugin[]} [plugins]
 */

/** The package version. */
export const version = __VERSION__;

const KEY = Symbol.for('cyclewire');

/**
 * Starts delegating events and activating triggers. Safe to call more than
 * once: later calls only register the `actions` they pass.
 * @param {Options} [options]
 * @returns {Wire}
 */
export function start(options = {}) {
    if (options.actions) register(options.actions);
    if (started) {
        if (__DEV__ && Object.keys(options).some((key) => key !== 'actions')) warn('start() already ran; later calls only register "actions".');
        return api;
    }
    const global = /** @type {any} */ (globalThis);
    if (global[KEY] && global[KEY] !== api) {
        warn('Another copy of CycleWire is running on this page; deferring to it. Load CycleWire once.');
        return global[KEY].start(options);
    }
    global[KEY] = api;

    for (const key of /** @type {const} */ (['capture', 'rootMargin', 'idleTimeout', 'mutations', 'shadow', 'preload', 'onError'])) {
        if (options[key] !== undefined) /** @type {any} */ (opts)[key] = options[key];
    }
    setPrefix(options.prefix ?? opts.prefix);
    for (const type of options.events || []) types.add(type);
    setStarted(true);
    for (const plugin of options.plugins || []) use(plugin);

    attach(document);
    triggers.watch(document);
    const activate = () => started && scan(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
    else activate();
    return api;
}

/** Removes every listener and observer and aborts running actions. */
export function stop() {
    if (!started) return;
    setStarted(false);
    detachAll();
    triggers.stopTriggers();
    abortAll();
    for (const plugin of plugins) plugin.stop?.();
    const global = /** @type {any} */ (globalThis);
    if (global[KEY] === api) delete global[KEY];
}

/**
 * Registers action modules. Registering a name again replaces it and forgets
 * its cached module.
 * @param {ActionMap} actions
 */
export function register(actions) {
    registry.register(actions);
    triggers.retry();
}

/**
 * Delegates more event types, e.g. `listen(['dblclick', 'contextmenu'])`.
 * @param {string[]} list
 * @param {{ capture?: boolean, passive?: boolean }} [options]
 */
export function listen(list, options) {
    delegateTypes(list, options);
}

/**
 * Activates the triggers and scheduled preloads inside `root`, `root`
 * included. Content added after start is scanned automatically unless
 * `mutations: false`.
 * @param {ParentNode} [root]
 */
export function scan(root = document) {
    triggers.scan(root);
}

/**
 * Makes CycleWire work inside a shadow root: events that do not cross the
 * shadow boundary (submit, change, toggle, command) are delegated there, and
 * its triggers are activated and watched.
 * @param {ShadowRoot | Element} root
 * @returns {() => void} undoes the observation
 */
export function observe(root) {
    return triggers.observe(root);
}

/**
 * Runs an action programmatically, with the same once, debounce and
 * concurrency rules as a delegated event. Resolves to the handler's return
 * value, or `undefined` when the run was dropped or cancelled.
 * @param {string} action
 * @param {Element} [element]
 * @param {Event | null} [event]
 * @returns {Promise<unknown>}
 */
export function run(action, element = document.documentElement, event = null) {
    if (!registry.has(action)) return Promise.reject(new Error(`[CycleWire] "${action}" is not registered`));
    if (!announce(element, action, event)) return Promise.resolve();
    return dispatch(element, action, event, event ? event.target : element, event ? event.type : null);
}

/**
 * Fetches an action's module ahead of use, regardless of Save-Data.
 * @param {string} action
 * @returns {Promise<void>}
 */
export function preload(action) {
    return registry.preload(splitName(action)[0]);
}

/**
 * Names of the action modules imported so far. Empty until the user reaches
 * for something: the whole point.
 * @returns {string[]}
 */
export function loaded() {
    return registry.loaded();
}

/**
 * Adds a plugin, such as `signals()` from `cyclewire/signals`.
 * @param {Plugin} plugin
 * @returns {Wire}
 */
export function use(plugin) {
    if (!plugins.includes(plugin)) {
        plugins.push(plugin);
        plugin.setup?.({ prefix: opts.prefix, wire: api });
    }
    return api;
}

/**
 * Turns a path → loader map, such as Vite's `import.meta.glob('./actions/**\/*.js')`,
 * into action names: `./actions/cart/add.js` becomes `cart.add`.
 * @param {Record<string, () => Promise<any>>} modules
 * @param {string} [base] path prefix to strip
 * @returns {ActionMap}
 */
export function fromGlob(modules, base = './actions/') {
    /** @type {ActionMap} */
    const actions = {};
    for (const path of Object.keys(modules)) {
        const name = (path.startsWith(base) ? path.slice(base.length) : path)
            .replace(/\.[cm]?[jt]sx?$/, '')
            .replace(/\/index$/, '')
            .replace(/\//g, '.');
        actions[name] = modules[path];
    }
    return actions;
}

Object.assign(api, { start, stop, register, listen, scan, observe, run, preload, loaded, use, fromGlob, version });

/**
 * @typedef {object} Wire
 * @property {typeof start} start
 * @property {typeof stop} stop
 * @property {typeof register} register
 * @property {typeof listen} listen
 * @property {typeof scan} scan
 * @property {typeof observe} observe
 * @property {typeof run} run
 * @property {typeof preload} preload
 * @property {typeof loaded} loaded
 * @property {typeof use} use
 * @property {typeof fromGlob} fromGlob
 * @property {string} version
 */
