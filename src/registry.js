import { splitName } from './attrs.js';
import { plugins } from './state.js';
import { link, trace, warn } from './util.js';

/**
 * The only door through which markup can reach code: names map to loaders,
 * and nothing that is not registered can ever be imported.
 */

/**
 * An action module: a function returning `import()`'s promise (what a bundler
 * understands), or a URL / import-map specifier string.
 * @typedef {(() => Promise<any>) | string} ModuleEntry
 */

/**
 * An action module with options for plugins, such as `css` for the
 * `styles()` plugin of `cyclewire/css`.
 * @typedef {{ module: ModuleEntry, css?: string | string[], [option: string]: unknown }} EntryWithOptions
 */

/** @typedef {ModuleEntry | EntryWithOptions} ActionEntry */

/** @typedef {Record<string, ActionEntry>} ActionMap */

const NAME = /^[\w.-]+$/;
const EXPORT = /^[\w$]*$/;

// Relative, root-relative and absolute URLs resolve against the page rather
// than this file, which may be served from a CDN. Bare specifiers are left to
// the page's import map.
const URLISH = /^(?:\.{0,2}\/|[a-z][\w+.-]*:)/i;

/** @param {string} specifier */
const resolveSpecifier = (specifier) => (URLISH.test(specifier) ? new URL(specifier, document.baseURI).href : specifier);

/** @param {ActionEntry | undefined} entry */
const moduleOf = (entry) => (entry && typeof entry === 'object' ? entry.module : entry);

/** @type {Map<string, ActionEntry>} */
const entries = new Map();
/** @type {Map<string, Promise<any>>} */
const modules = new Map();
/** @type {Set<string>} */
const ready = new Set();
/** @type {Set<string>} */
const preloaded = new Set();
/** Failed attempts per name. Browsers remember a failed module URL, so a retry needs a fresh one. @type {Map<string, number>} */
const failures = new Map();

/** @param {string} name @param {string} entry */
function url(name, entry) {
    const resolved = resolveSpecifier(entry);
    const attempt = failures.get(name);
    if (!attempt || resolved === entry) return resolved;
    return `${resolved}${resolved.includes('?') ? '&' : '?'}cw-retry=${attempt}`;
}

/** @param {ActionMap} map */
export function register(map) {
    for (const name of Object.keys(map)) {
        const mod = moduleOf(map[name]);
        if (!NAME.test(name) || (typeof mod !== 'function' && typeof mod !== 'string')) {
            if (__DEV__) warn(`Ignoring action "${name}": use a name made of letters, digits, "_", "-" and ".", and a loader function, a URL or { module }.`);
            continue;
        }
        entries.set(name, map[name]);
        modules.delete(name);
        ready.delete(name);
        preloaded.delete(name);
        failures.delete(name);
    }
}

/**
 * Whether `module#export` refers to a registered module.
 * @param {string} action
 */
export function has(action) {
    const [name, exported] = splitName(action);
    return entries.has(name) && EXPORT.test(exported);
}

/** @param {string} name */
export const isReady = (name) => ready.has(name);

/** @param {string} name */
export const entry = (name) => entries.get(name);

/** Names of the action modules imported so far. */
export const loaded = () => [...ready];

/** Names of the registered action modules. */
export const registered = () => [...entries.keys()];

/**
 * Imports a module once; concurrent callers share the promise and a failed
 * load is forgotten so the next interaction can retry it.
 * @param {string} name module name, without `#export`
 * @returns {Promise<any>}
 */
export function load(name) {
    let promise = modules.get(name);
    if (!promise) {
        const source = moduleOf(entries.get(name));
        if (!source) return Promise.reject(new Error(`[CycleWire] "${name}" is not registered`));
        if (__DEV__) trace({ type: 'import', name });
        const pending = typeof source === 'function'
            ? source()
            : import(/* webpackIgnore: true */ /* @vite-ignore */ url(name, source));
        promise = pending.then(
            (mod) => {
                if (modules.get(name) === promise) ready.add(name);
                if (__DEV__) trace({ type: 'imported', name, ok: true });
                return mod;
            },
            (error) => {
                if (modules.get(name) === promise) {
                    modules.delete(name);
                    failures.set(name, (failures.get(name) || 0) + 1);
                }
                if (__DEV__) trace({ type: 'imported', name, ok: false, error });
                throw error;
            },
        );
        modules.set(name, promise);
    }
    return promise;
}

/**
 * Fetches a module ahead of use, once, and lets plugins fetch what else the
 * action needs. URL entries use `<link rel="modulepreload">`, which downloads
 * and compiles without evaluating, at high priority for intent and `load`,
 * and at low priority when it is speculative, so it never delays the page's
 * own images. Loader functions have to be called, which evaluates the module.
 * Failures stay silent: the real interaction retries and reports.
 * @param {string} name
 * @param {string} [reason] what asked for it: intent, a cw-preload value, or nothing for preload()
 * @returns {Promise<void>}
 */
export function preload(name, reason) {
    const found = entries.get(name);
    const mod = moduleOf(found);
    if (!found || modules.has(name) || preloaded.has(name)) return Promise.resolve();
    preloaded.add(name);
    for (const plugin of plugins) plugin.preload?.(found, name);
    if (__DEV__) trace({ type: 'preload', name, reason });
    const forget = () => {
        preloaded.delete(name);
    };
    if (typeof mod !== 'string' || !URLISH.test(mod)) return load(name).then(forget, forget);
    return new Promise((resolve) => {
        const hint = link('modulepreload', url(name, mod));
        if (reason) hint.fetchPriority = reason === 'intent' || reason === 'load' ? 'high' : 'low';
        hint.onload = () => resolve();
        hint.onerror = () => {
            // Some browsers remember the failed URL, so the real import uses a fresh one.
            failures.set(name, (failures.get(name) || 0) + 1);
            resolve(forget());
        };
        document.head.append(hint);
    });
}
