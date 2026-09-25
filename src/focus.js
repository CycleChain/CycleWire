/**
 * Keeps focus and text selection across DOM replacement (swap, morph).
 * Internal: shared by dom.js and morph.js, not part of the public API.
 */

/** The focused element, looking through open shadow roots. */
export function deepActive() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/**
 * @typedef {object} FocusSnapshot
 * @property {Element} el
 * @property {string} id
 * @property {Node} root
 * @property {[number, number, ('forward' | 'backward' | 'none' | undefined)] | null} selection
 */

/** @returns {FocusSnapshot | null} */
export function snapshot() {
    const el = deepActive();
    if (!el || el === document.body) return null;
    /** @type {FocusSnapshot['selection']} */
    let selection = null;
    try {
        const input = /** @type {HTMLInputElement} */ (el);
        if (input.selectionStart != null) selection = [input.selectionStart, input.selectionEnd ?? input.selectionStart, input.selectionDirection ?? undefined];
    } catch {
        // Some input types throw on selection access.
    }
    return { el, id: el.id, root: el.getRootNode(), selection };
}

/**
 * Refocuses the element that had focus, or its replacement with the same id.
 * @param {FocusSnapshot | null} saved
 */
export function restore(saved) {
    if (!saved) return;
    /** @type {Element | null} */
    let el = saved.el;
    if (!el.isConnected) {
        const root = /** @type {Document | ShadowRoot} */ (saved.root);
        el = saved.id && root.getElementById ? root.getElementById(saved.id) : null;
    }
    if (!el || el === deepActive()) return;
    /** @type {HTMLElement} */ (el).focus?.({ preventScroll: true });
    if (!saved.selection) return;
    try {
        /** @type {HTMLInputElement} */ (el).setSelectionRange(...saved.selection);
    } catch {
        // Not a text control any more.
    }
}
