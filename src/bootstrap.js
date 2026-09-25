/**
 * cyclewire/bootstrap — Bootstrap 5's data API (collapse, dropdown, modal,
 * offcanvas, tab/pill/list, alert) without the 80 KB bootstrap.bundle.js.
 * Works with Bootstrap's CSS and markup as-is. Opt-in: do not combine it with
 * Bootstrap's own JavaScript on the same page.
 *
 *   import { bootstrap } from 'cyclewire/bootstrap';
 *   start({ plugins: [bootstrap({ global: true })] });
 *
 * For new markup prefer the platform: <dialog> with Invoker Commands
 * (command / commandfor), the Popover API and <details name>.
 */

const DROPDOWN_PARENT = '.dropdown,.dropup,.dropend,.dropstart,.dropup-center,.dropdown-center,.btn-group,.nav-item';
const TOGGLES = '[data-bs-toggle="tab"],[data-bs-toggle="pill"],[data-bs-toggle="list"]';
const NAV = '.nav,.list-group,[role="tablist"]';
const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/** @typedef {'modal' | 'offcanvas'} Overlay */

/** Open overlays, innermost last. @type {{ el: HTMLElement, kind: Overlay, trigger: Element | null, backdrop: HTMLElement | null }[]} */
const stack = [];
/** @type {WeakMap<Element, Modal>} */
const instances = new WeakMap();
let started = false;

/**
 * Fires a Bootstrap-compatible event, e.g. `show.bs.modal`.
 * @param {Element} el @param {string} name @param {string} component @param {Element | null} [relatedTarget]
 * @returns {boolean} false when a listener called preventDefault()
 */
function fire(el, name, component, relatedTarget = null) {
    const event = new Event(`${name}.bs.${component}`, { bubbles: true, cancelable: true });
    /** @type {any} */ (event).relatedTarget = relatedTarget;
    return el.dispatchEvent(event);
}

/**
 * The elements a trigger points at (data-bs-target or href). Hrefs that are
 * not selectors, such as real URLs, simply match nothing.
 * @param {Element} trigger
 * @returns {HTMLElement[]}
 */
function targets(trigger) {
    const selector = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
    if (!selector || selector === '#') return [];
    try {
        return [...document.querySelectorAll(selector)].map((el) => /** @type {HTMLElement} */ (el));
    } catch {
        return [];
    }
}

// --------------------------------------------------------------- overlays

/** @param {HTMLElement} el @param {Overlay} kind @param {Element | null} trigger */
function open(el, kind, trigger) {
    if (el.classList.contains('show') || !fire(el, 'show', kind, trigger)) return;
    for (const entry of [...stack]) if (entry.kind === kind) close(entry.el, kind);
    let backdrop = null;
    if (el.getAttribute('data-bs-backdrop') !== 'false') {
        backdrop = document.createElement('div');
        backdrop.className = `${kind}-backdrop fade show`;
        document.body.append(backdrop);
    }
    stack.push({ el, kind, trigger: trigger || document.activeElement, backdrop });
    el.classList.add('show');
    if (kind === 'modal') el.style.display = 'block';
    el.removeAttribute('aria-hidden');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    if (kind === 'modal' || el.getAttribute('data-bs-scroll') !== 'true') document.body.classList.add('modal-open');
    const first = /** @type {HTMLElement | null} */ (el.querySelector('[autofocus]') || el.querySelector(FOCUSABLE));
    (first || el).focus({ preventScroll: true });
    fire(el, 'shown', kind, trigger);
}

/** @param {HTMLElement} el @param {Overlay} kind */
function close(el, kind) {
    const index = stack.findIndex((entry) => entry.el === el);
    if (index < 0 || !fire(el, 'hide', kind)) return;
    const [entry] = stack.splice(index, 1);
    el.classList.remove('show');
    if (kind === 'modal') el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('aria-modal');
    entry.backdrop?.remove();
    if (!stack.length) document.body.classList.remove('modal-open');
    /** @type {HTMLElement | null} */ (entry.trigger)?.focus?.({ preventScroll: true });
    fire(el, 'hidden', kind);
}

/**
 * Drop-in stand-in for `bootstrap.Modal`: `Modal.getOrCreateInstance(el).show()`.
 */
export class Modal {
    /** @param {Element} el */
    static getOrCreateInstance(el) {
        return instances.get(el) || new this(el);
    }

    /** @param {Element} el */
    static getInstance(el) {
        return instances.get(el) || null;
    }

    /** @param {Element} el @param {Overlay} [kind] */
    constructor(el, kind = 'modal') {
        this.el = /** @type {HTMLElement} */ (el);
        this.kind = kind;
        instances.set(el, this);
    }

    /** @param {Element | null} [relatedTarget] */
    show(relatedTarget = null) {
        open(this.el, this.kind, relatedTarget);
    }

    hide() {
        close(this.el, this.kind);
    }

    /** @param {Element | null} [relatedTarget] */
    toggle(relatedTarget = null) {
        if (this.el.classList.contains('show')) this.hide();
        else this.show(relatedTarget);
    }
}

/** Drop-in stand-in for `bootstrap.Offcanvas`. */
export class Offcanvas extends Modal {
    /** @param {Element} el */
    constructor(el) {
        super(el, 'offcanvas');
    }
}

/** @param {Element} el @param {Element | null} [trigger] */
export const openModal = (el, trigger = null) => Modal.getOrCreateInstance(el).show(trigger);

/** @param {Element} el */
export const closeModal = (el) => Modal.getOrCreateInstance(el).hide();

// -------------------------------------------------------------- dropdowns

/** @param {Element} toggle */
function menuOf(toggle) {
    const next = toggle.nextElementSibling;
    if (next && next.classList.contains('dropdown-menu')) return next;
    return toggle.closest(DROPDOWN_PARENT)?.querySelector('.dropdown-menu') || null;
}

/** @param {Element} menu */
function toggleOf(menu) {
    const previous = menu.previousElementSibling;
    if (previous && previous.matches('[data-bs-toggle="dropdown"]')) return previous;
    return menu.closest(DROPDOWN_PARENT)?.querySelector('[data-bs-toggle="dropdown"]') || null;
}

function closeDropdowns() {
    for (const menu of document.querySelectorAll('.dropdown-menu.show')) {
        const toggle = toggleOf(menu);
        if (toggle && !fire(toggle, 'hide', 'dropdown')) continue;
        menu.classList.remove('show');
        toggle?.classList.remove('show');
        toggle?.setAttribute('aria-expanded', 'false');
        if (toggle) fire(toggle, 'hidden', 'dropdown');
    }
}

/** @param {Element} toggle */
function toggleDropdown(toggle) {
    const menu = menuOf(toggle);
    if (!menu) return;
    const show = !menu.classList.contains('show');
    closeDropdowns();
    if (!show || !fire(toggle, 'show', 'dropdown')) return;
    menu.classList.add('show');
    toggle.classList.add('show');
    toggle.setAttribute('aria-expanded', 'true');
    fire(toggle, 'shown', 'dropdown');
}

// ------------------------------------------------------ collapse and tabs

/** @param {Element} trigger */
function toggleCollapse(trigger) {
    for (const panel of targets(trigger)) {
        const show = !panel.classList.contains('show');
        if (!fire(panel, show ? 'show' : 'hide', 'collapse')) continue;
        const parent = panel.getAttribute('data-bs-parent');
        if (show && parent) {
            for (const other of document.querySelectorAll(`.collapse.show[data-bs-parent="${CSS.escape(parent)}"]`)) {
                if (other !== panel) setCollapsed(/** @type {HTMLElement} */ (other), false);
            }
        }
        setCollapsed(panel, show);
        fire(panel, show ? 'shown' : 'hidden', 'collapse');
    }
}

/** @param {HTMLElement} panel @param {boolean} show */
function setCollapsed(panel, show) {
    panel.classList.toggle('show', show);
    if (!panel.id) return;
    const id = CSS.escape(panel.id);
    for (const trigger of document.querySelectorAll(`[data-bs-toggle="collapse"][data-bs-target="#${id}"],[data-bs-toggle="collapse"][href="#${id}"]`)) {
        trigger.setAttribute('aria-expanded', String(show));
        trigger.classList.toggle('collapsed', !show);
    }
}

/** @param {Element} trigger */
function showTab(trigger) {
    const nav = trigger.closest(NAV);
    if (!nav || trigger.classList.contains('active') || !fire(trigger, 'show', 'tab')) return;
    for (const tab of nav.querySelectorAll(TOGGLES)) {
        if (tab.closest(NAV) !== nav) continue;
        const active = tab === trigger;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    }
    const pane = targets(trigger)[0];
    if (pane && pane.parentElement) {
        for (const sibling of pane.parentElement.children) {
            if (sibling.classList.contains('tab-pane')) sibling.classList.remove('active', 'show');
        }
        pane.classList.add('active', 'show');
    }
    fire(trigger, 'shown', 'tab');
}

// ---------------------------------------------------------------- events

/** @param {MouseEvent} event */
function onClick(event) {
    const target = /** @type {Element} */ (event.target);
    if (!target || !target.closest) return;

    // Clicks outside an open menu, or on one of its items, close it.
    const inMenu = target.closest('.dropdown-menu');
    const dropdownToggle = target.closest('[data-bs-toggle="dropdown"]');
    if (!dropdownToggle && (!inMenu || target.closest('.dropdown-item'))) closeDropdowns();

    const dismiss = target.closest('[data-bs-dismiss]');
    if (dismiss) {
        const kind = dismiss.getAttribute('data-bs-dismiss');
        if (kind === 'modal' || kind === 'offcanvas') {
            event.preventDefault();
            const el = /** @type {HTMLElement | null} */ (dismiss.closest(`.${kind}`)) || [...stack].reverse().find((entry) => entry.kind === kind)?.el;
            if (el) close(el, kind);
            return;
        }
        if (kind === 'alert') {
            const alert = dismiss.closest('.alert');
            if (alert && fire(alert, 'close', 'alert')) alert.remove();
            return;
        }
    }

    // A click on the modal itself (not its dialog) or on an offcanvas backdrop.
    const top = stack[stack.length - 1];
    if (top && top.el.getAttribute('data-bs-backdrop') !== 'static') {
        if ((top.kind === 'modal' && target === top.el) || (top.backdrop && target === top.backdrop)) {
            close(top.el, top.kind);
            return;
        }
    }

    const toggle = target.closest('[data-bs-toggle]');
    if (!toggle) return;
    const type = toggle.getAttribute('data-bs-toggle');
    if (type === 'dropdown') toggleDropdown(toggle);
    else if (type === 'collapse') toggleCollapse(toggle);
    else if (type === 'modal' || type === 'offcanvas') {
        const el = targets(toggle)[0];
        if (el) (type === 'modal' ? Modal : Offcanvas).getOrCreateInstance(el).toggle(toggle);
    } else if (type === 'tab' || type === 'pill' || type === 'list') showTab(toggle);
    else return;
    event.preventDefault();
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
    const top = stack[stack.length - 1];
    if (event.key === 'Escape') {
        if (top) {
            if (top.el.getAttribute('data-bs-keyboard') !== 'false') close(top.el, top.kind);
            return;
        }
        const menu = document.querySelector('.dropdown-menu.show');
        if (!menu) return;
        const toggle = /** @type {HTMLElement | null} */ (toggleOf(menu));
        closeDropdowns();
        toggle?.focus();
        return;
    }
    if (event.key === 'Tab' && top) {
        // Keep focus inside the open modal or offcanvas. Tab order is handled
        // here rather than left to the browser, whose idea of what is
        // tabbable differs (Safari skips buttons by default).
        event.preventDefault();
        const items = /** @type {HTMLElement[]} */ ([...top.el.querySelectorAll(FOCUSABLE)]).filter((el) => el.getClientRects().length);
        if (!items.length) return;
        const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
        items[next].focus();
        return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const menu = document.querySelector('.dropdown-menu.show');
        const active = document.activeElement;
        // Safari and Firefox on macOS do not focus a clicked button, so focus may still be on the body.
        if (!menu || !(menu.contains(active) || toggleOf(menu) === active || active === document.body)) return;
        const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.dropdown-item:not(.disabled):not(:disabled)')]);
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const next = event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0);
        items[index < 0 ? 0 : next].focus();
    }
}

/**
 * Starts handling Bootstrap's data attributes.
 * @param {{ global?: boolean }} [options]  global: also define `window.bootstrap.Modal` / `.Offcanvas` when Bootstrap's JS is absent
 */
export function start(options = {}) {
    if (!started) {
        started = true;
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeydown);
    }
    const global = /** @type {any} */ (globalThis);
    if (options.global && !global.bootstrap) global.bootstrap = { Modal, Offcanvas };
}

export function stop() {
    started = false;
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
}

/**
 * The same, as a CycleWire plugin: `start({ plugins: [bootstrap()] })`.
 * @param {{ global?: boolean }} [options]
 * @returns {import('./index.js').Plugin}
 */
export const bootstrap = (options) => ({ setup: () => start(options), stop });
