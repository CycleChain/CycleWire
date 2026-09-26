/**
 * CycleWire attributes for server-rendered HTML and JSX: cwAttrs('cart#add', { sku })
 * in a template literal, <button {...cw('cart#add', { sku })}> in JSX.
 * From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
 */

const ACTION = /^[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?$/;
const EVENT = /^[a-z][a-z0-9:_-]*$/;
const PREFIX = /^(?:[a-z0-9-]*-)?$/;
// Options printed after the action and props, in this order.
const ORDER = ['trigger', 'preload', 'concurrency', 'debounce', 'once', 'prevent'];
// The strings each option accepts. debounce takes an integer instead, and once only true.
/** @type {Record<string, RegExp | undefined>} */
const STRINGS = {
    trigger: /^(?:load|idle|visible|media:.+)$/s,
    preload: /^(?:intent|visible|idle|load|none)$/,
    concurrency: /^(?:drop|restart|latest|parallel)$/,
    prevent: /^[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*$/,
};
/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

/**
 * @typedef {object} Options  null or false leaves an option out
 * @property {string | null | false} [on]  an event name: data-cw-on-<on> replaces data-cw-action
 * @property {string | null | false} [trigger]  load, idle, visible or media:<query>
 * @property {string | null | false} [preload]  intent, visible, idle, load or none
 * @property {string | null | false} [concurrency]  drop, restart, latest or parallel
 * @property {number | null | false} [debounce]  milliseconds
 * @property {boolean | null} [once]
 * @property {boolean | string | null} [prevent]  true, or event names such as 'click submit'
 * @property {string | null | false} [prefix]  the prefix given to start(); 'cw-' by default
 */

/** @param {string} value */
const escape = (value) => value.replace(/[&"'<>]/g, (char) => ENTITIES[char]);

/** @param {string} name @param {unknown} value */
function valid(name, value) {
    if (value === true) return name === 'once' || name === 'prevent';
    if (name === 'debounce') return Number.isSafeInteger(value) && Number(value) >= 0;
    return typeof value === 'string' && !!STRINGS[name]?.test(value);
}

/**
 * The attributes as an object to spread in JSX. Values are raw, since JSX
 * escapes attributes itself; once and prevent: true give '', a bare attribute.
 * @param {string} action `module` or `module#export`
 * @param {unknown} [props] anything JSON.stringify() takes, or null for none
 * @param {Options} [options]
 * @returns {Record<string, string>}
 * @throws {TypeError} for a bad name, option or value
 */
export function cw(action, props = null, options = {}) {
    for (const name of Object.keys(options)) {
        if (name !== 'on' && name !== 'prefix' && !ORDER.includes(name)) {
            throw new TypeError(`CycleWire: unknown option ${JSON.stringify(name)}`);
        }
    }
    if (typeof action !== 'string' || !ACTION.test(action)) {
        throw new TypeError(`CycleWire: invalid action ${JSON.stringify(action)}`);
    }
    // null, undefined and false leave an option out, so values can come straight from variables.
    /** @type {Record<string, unknown>} */
    const given = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value != null && value !== false),
    );
    const { prefix = 'cw-', on } = given;
    if (typeof prefix !== 'string' || !PREFIX.test(prefix)) {
        throw new TypeError(`CycleWire: invalid prefix ${JSON.stringify(prefix)}`);
    }
    if (on !== undefined && (typeof on !== 'string' || !EVENT.test(on))) {
        throw new TypeError(`CycleWire: invalid on ${JSON.stringify(on)}`);
    }

    /** @type {Record<string, string>} */
    const attributes = { [`data-${prefix}${on === undefined ? 'action' : `on-${on}`}`]: action };
    if (props != null) {
        const json = JSON.stringify(props);
        if (json === undefined) throw new TypeError('CycleWire: props must be something JSON can hold');
        attributes[`data-${prefix}props`] = json;
    }
    for (const name of ORDER) {
        const value = given[name];
        if (value === undefined) continue;
        if (!valid(name, value)) throw new TypeError(`CycleWire: invalid ${name} ${JSON.stringify(value)}`);
        attributes[`data-${prefix}${name}`] = value === true ? '' : String(value);
    }
    return attributes;
}

/**
 * The attributes as one string, escaped for HTML, to print inside a start tag:
 * data-cw-action="cart#add" data-cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}".
 * @param {string} action `module` or `module#export`
 * @param {unknown} [props] anything JSON.stringify() takes, or null for none
 * @param {Options} [options]
 * @returns {string}
 * @throws {TypeError} for a bad name, option or value
 */
export function cwAttrs(action, props = null, options = {}) {
    return Object.entries(cw(action, props, options))
        .map(([name, value]) => (value === '' ? name : `${name}="${escape(value)}"`))
        .join(' ');
}
