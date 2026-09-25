/** @param {...unknown} args */
export const warn = (...args) => console.warn('[CycleWire]', ...args);

export const noop = () => {};

/**
 * A detached `<link>`.
 * @param {string} rel
 * @param {string} href
 * @returns {HTMLLinkElement}
 */
export const link = (rel, href) => Object.assign(document.createElement('link'), { rel, href });

/**
 * True when the visitor asked to save data or is on a 2G-class connection.
 * Speculative work (preloading) is skipped then; explicit calls are not.
 */
export function saveData() {
    const connection = /** @type {any} */ (navigator).connection;
    return !!connection && (!!connection.saveData || /2g/.test(connection.effectiveType || ''));
}

/**
 * Dispatches a `cw:<type>` lifecycle event on `el`. It bubbles and crosses
 * shadow boundaries so a single document listener can observe every run.
 *
 * @param {Element} el
 * @param {string} type
 * @param {object} detail
 * @param {boolean} [cancelable]
 * @returns {boolean} false when a listener called preventDefault()
 */
export function emit(el, type, detail, cancelable = false) {
    return el.dispatchEvent(new CustomEvent(`cw:${type}`, { bubbles: true, composed: true, cancelable, detail }));
}
