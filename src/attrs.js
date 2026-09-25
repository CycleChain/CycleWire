/**
 * The attribute vocabulary and the per-event defaults every other module
 * reads. All names derive from one prefix: `cw-` by default, so a page can
 * move CycleWire into its own namespace (`x-` gives `data-x-action`).
 */

/** @typedef {'drop' | 'restart' | 'latest' | 'parallel'} Concurrency */

/** @param {string} prefix */
export function attrNames(prefix) {
    /** @param {string} name */
    const attr = (name) => `data-${prefix}${name}`;
    return {
        action: attr('action'),
        on: attr('on-'),
        trigger: attr('trigger'),
        preload: attr('preload'),
        prevent: attr('prevent'),
        once: attr('once'),
        debounce: attr('debounce'),
        concurrency: attr('concurrency'),
        props: attr('props'),
        ignore: attr('ignore'),
        pending: attr('pending'),
    };
}

/** @typedef {ReturnType<typeof attrNames>} Attrs */

/** Event types delegated out of the box; add more with `listen()`. */
export const DEFAULT_EVENTS = ['click', 'submit', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout', 'pointerdown', 'toggle', 'command'];

/**
 * Events that never bubble. They are delegated in the capture phase and
 * matched against the event target only.
 */
export const NON_BUBBLING = new Set([
    'focus', 'blur', 'toggle', 'beforetoggle', 'command', 'invalid', 'load', 'error',
    'close', 'cancel', 'scroll', 'scrollend', 'pointerenter', 'pointerleave', 'mouseenter', 'mouseleave',
]);

const PASSIVE = /^(?:pointer(?:over|out|move|enter|leave)|mouse(?:over|out|move|enter|leave)|touch(?:start|move|end|cancel)|wheel|scroll)$/;

/**
 * Listeners for these events can never cancel anything useful, so they are
 * registered as passive and never block scrolling.
 * @param {string} type
 */
export const isPassive = (type) => PASSIVE.test(type);

const CHANGE_INPUTS = /^(?:checkbox|radio|file|range|color|date|datetime-local|month|week|time)$/;
const CLICK_INPUTS = /^(?:button|submit|reset|image)$/;

/**
 * The event a bare `data-cw-action` listens for on this element.
 * @param {Element} el
 * @returns {string}
 */
export function defaultEvent(el) {
    switch (el.localName) {
        case 'form': return 'submit';
        case 'select': return 'change';
        case 'textarea': return 'input';
        case 'details': return 'toggle';
        case 'input': {
            const type = /** @type {HTMLInputElement} */ (el).type;
            return CLICK_INPUTS.test(type) ? 'click' : CHANGE_INPUTS.test(type) ? 'change' : 'input';
        }
    }
    return 'click';
}

const MODES = /^(?:drop|restart|latest|parallel)$/;

/**
 * The concurrency mode for a run: the element's own setting if it is valid,
 * otherwise the default for the event type (`null` for triggers and `run()`).
 * @param {string | null} value
 * @param {string | null} type
 * @returns {Concurrency}
 */
export function concurrency(value, type) {
    if (value && MODES.test(value)) return /** @type {Concurrency} */ (value);
    if (!type || type === 'click' || type === 'submit' || type === 'command') return 'drop';
    if (type === 'input') return 'restart';
    if (type === 'change' || type === 'toggle') return 'latest';
    return 'parallel';
}

/**
 * Splits `module#export` into its parts; the export is empty when omitted.
 * @param {string} name
 * @returns {[string, string]}
 */
export function splitName(name) {
    const hash = name.indexOf('#');
    return hash < 0 ? [name, ''] : [name.slice(0, hash), name.slice(hash + 1)];
}

/**
 * Whether an element sits inside `data-cw-ignore` (itself included), across
 * shadow roots. Nothing in there activates: no actions, triggers or preloads.
 * @param {Element} el
 * @param {Attrs} attrs
 */
export function ignored(el, attrs) {
    for (let node = /** @type {any} */ (el); node; node = node.parentNode || node.host) {
        if (node.nodeType === 1 && node.hasAttribute(attrs.ignore)) return true;
    }
    return false;
}

/**
 * Every action name bound on an element, through `data-cw-action` or any
 * `data-cw-on-<event>` attribute.
 * @param {Element} el
 * @param {Attrs} attrs
 * @returns {string[]}
 */
export function actionsOf(el, attrs) {
    const names = [];
    for (const { name, value } of el.attributes) {
        if (value && (name === attrs.action || name.startsWith(attrs.on))) names.push(value.trim());
    }
    return names;
}
