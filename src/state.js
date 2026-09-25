import { attrNames, DEFAULT_EVENTS } from './attrs.js';

/**
 * State shared by the core modules. Everything here is module scoped, so a
 * bundler can rename it freely; `attrs` and `started` are live bindings.
 */

export const opts = {
    prefix: 'cw-',
    capture: false,
    rootMargin: '120px',
    idleTimeout: 2000,
    mutations: true,
    shadow: false,
    /** @type {((error: unknown, info: import('./index.js').RunInfo) => void) | undefined} */
    onError: undefined,
};

/** Attribute names for the current prefix. */
export let attrs = attrNames(opts.prefix);

/** @param {string} prefix */
export function setPrefix(prefix) {
    opts.prefix = prefix;
    attrs = attrNames(prefix);
}

/** Whether start() is in effect. */
export let started = false;

/** @param {boolean} value */
export function setStarted(value) {
    started = value;
}

/** Event types delegated on every root. */
export const types = new Set(DEFAULT_EVENTS);

/** @type {import('./index.js').Plugin[]} */
export const plugins = [];

/** The public API, handed to actions as `ctx.wire`. Filled in by index.js. */
export const api = /** @type {import('./index.js').Wire} */ ({});
