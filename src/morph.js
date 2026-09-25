/**
 * cyclewire/morph — update the page to match new server-rendered HTML while
 * keeping the elements that stay, and with them focus, typed-in values,
 * scroll positions, playing media and loaded iframes. The job a virtual DOM
 * would do, done DOM-to-DOM: nothing is re-rendered on the client.
 *
 *   const res = await fetch('/cart/partial');
 *   await morph(cart, html.raw(await res.text()));
 */
import { restore, snapshot } from './focus.js';
import { fragment, isSafeHTML, transition } from './dom.js';

/**
 * @typedef {object} MorphOptions
 * @property {boolean} [children]  morph the target's children (default) or, when false, the target element itself
 * @property {string} [key]        attribute that pairs siblings without ids. Default "data-cw-key"
 * @property {string} [preserve]   attribute marking elements to leave untouched. Default "data-cw-preserve"
 * @property {(from: Element, to: Element) => boolean | void} [beforeUpdate]  return false to leave `from` as it is
 * @property {(node: Node) => boolean | void} [beforeRemove]  return false to keep the node
 * @property {boolean} [transition]  run inside a View Transition where supported
 */

/**
 * Moves a node, keeping its state where the browser supports `moveBefore()`.
 * @param {ParentNode & Node} parent @param {Node} node @param {Node | null} ref
 */
function move(parent, node, ref) {
    const moveBefore = /** @type {any} */ (parent).moveBefore;
    if (moveBefore && node.isConnected && parent.isConnected) {
        try {
            moveBefore.call(parent, node, ref);
            return;
        } catch {
            // Different shadow trees or documents: fall back to a plain move.
        }
    }
    parent.insertBefore(node, ref);
}

/**
 * Morphs `target` to match `content`.
 * @param {Element} target
 * @param {import('./dom.js').SafeHTML | Node} content  wrap trusted server markup in `html.raw()`
 * @param {MorphOptions} [options]
 * @returns {Promise<void>} settles once the DOM is updated
 */
export function morph(target, content, options = {}) {
    if (!isSafeHTML(content) && !(content instanceof Node)) {
        throw new TypeError('[CycleWire] morph() takes SafeHTML or a Node; mark trusted server markup with html.raw(markup)');
    }
    const update = () => {
        const saved = snapshot();
        run(target, fragment(content), options, saved && saved.el);
        restore(saved);
    };
    if (options.transition) return transition(update);
    update();
    return Promise.resolve();
}

/**
 * @param {Element} root
 * @param {DocumentFragment} next
 * @param {MorphOptions} options
 * @param {Element | null} focused  the element focused before the morph; a plain
 *   insertBefore() (no moveBefore) blurs it, so the live activeElement cannot be trusted
 */
function run(root, next, options, focused) {
    const keyAttr = options.key || 'data-cw-key';
    const preserveAttr = options.preserve || 'data-cw-preserve';

    // Old elements whose id reappears in the new content are paired by id,
    // wherever they sit, and moved into place rather than recreated.
    /** @type {Set<string>} */
    const wanted = new Set();
    for (const el of next.querySelectorAll('[id]')) wanted.add(el.id);
    /** @type {Map<string, Element>} */
    const byId = new Map();
    if (root.id && wanted.has(root.id)) byId.set(root.id, root);
    for (const el of root.querySelectorAll('[id]')) if (wanted.has(el.id)) byId.set(el.id, el);
    /** @type {WeakSet<Node>} */
    const used = new WeakSet();
    /** Parking spot for removed nodes that still hold ids needed further on. @type {HTMLElement | null} */
    let pantry = null;

    /** @param {Element} el */
    const reserved = (el) => (el.id && byId.get(el.id) === el) || el.hasAttribute(keyAttr);

    /** Whether `el` or a descendant is an unclaimed element needed elsewhere. @param {Element} el */
    function holdsWanted(el) {
        if (byId.get(el.id) === el && !used.has(el)) return true;
        for (const inner of el.querySelectorAll('[id]')) if (byId.get(inner.id) === inner && !used.has(inner)) return true;
        return false;
    }

    /**
     * The old node that should become `node`, if any.
     * @param {Node} node @param {ChildNode | null} cursor @param {Node} parent
     * @returns {Node | null}
     */
    function find(node, cursor, parent) {
        if (node.nodeType !== 1) {
            return cursor && cursor.nodeType === node.nodeType && !used.has(cursor) ? cursor : null;
        }
        const el = /** @type {Element} */ (node);
        if (el.id) {
            const old = byId.get(el.id);
            return old && !used.has(old) && old.localName === el.localName && !old.contains(parent) ? old : null;
        }
        const key = el.getAttribute(keyAttr);
        for (let n = cursor; n; n = n.nextSibling) {
            if (n.nodeType !== 1 || used.has(n)) continue;
            const candidate = /** @type {Element} */ (n);
            if (key !== null) {
                if (candidate.localName === el.localName && candidate.getAttribute(keyAttr) === key) return candidate;
                continue;
            }
            // Without an id or key, only the element at the cursor can match.
            return candidate.localName === el.localName && !reserved(candidate) ? candidate : null;
        }
        return null;
    }

    /** @param {Element} from @param {Element} to */
    function attributes(from, to) {
        /** @type {Set<string>} */
        const changed = new Set();
        for (const { name } of [...from.attributes]) {
            if (!to.hasAttribute(name)) {
                from.removeAttribute(name);
                changed.add(name);
            }
        }
        for (const { name, value } of [...to.attributes]) {
            if (from.getAttribute(name) !== value) {
                from.setAttribute(name, value);
                changed.add(name);
            }
        }
        // Properties follow attributes only when the server changed them, and
        // never under the user's cursor.
        if (from === focused) return;
        const control = /** @type {any} */ (from);
        if (from.localName === 'input') {
            if (changed.has('value')) control.value = to.getAttribute('value') ?? '';
            if (changed.has('checked')) control.checked = to.hasAttribute('checked');
        } else if (from.localName === 'option' && changed.has('selected')) {
            control.selected = to.hasAttribute('selected');
        }
    }

    /** @param {Node} from @param {Node} to */
    function update(from, to) {
        used.add(from);
        if (from.nodeType !== 1) {
            if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
            return;
        }
        const a = /** @type {Element} */ (from);
        const b = /** @type {Element} */ (to);
        if (a.hasAttribute(preserveAttr)) return;
        if (options.beforeUpdate && options.beforeUpdate(a, b) === false) return;
        attributes(a, b);
        if (a.localName === 'textarea') {
            const text = b.textContent || '';
            const area = /** @type {HTMLTextAreaElement} */ (a);
            if (area.defaultValue !== text) {
                area.defaultValue = text;
                if (a !== focused) area.value = text;
            }
            return;
        }
        if (a.localName === 'template') {
            /** @type {HTMLTemplateElement} */ (a).content.replaceChildren(/** @type {HTMLTemplateElement} */ (b).content);
            return;
        }
        children(a, b);
    }

    /** @param {ParentNode & Node} parent @param {Node} node @param {Node | null} ref */
    function insert(parent, node, ref) {
        // A new element that contains ids from the old tree is rebuilt around them.
        if (node.nodeType === 1 && byId.size && holdsNeeded(/** @type {Element} */ (node))) {
            const shell = /** @type {Element} */ (node.cloneNode(false));
            parent.insertBefore(shell, ref);
            children(shell, /** @type {Element} */ (node));
        } else {
            parent.insertBefore(node, ref);
        }
    }

    /** @param {Element} el */
    function holdsNeeded(el) {
        for (const inner of el.querySelectorAll('[id]')) {
            const old = byId.get(inner.id);
            if (old && !used.has(old)) return true;
        }
        return false;
    }

    /** @param {ChildNode} node */
    function remove(node) {
        if (options.beforeRemove && options.beforeRemove(node) === false) return;
        if (node.nodeType === 1 && holdsWanted(/** @type {Element} */ (node))) {
            if (!pantry) {
                pantry = document.createElement('div');
                pantry.hidden = true;
                if (root.isConnected && root.parentNode) root.parentNode.insertBefore(pantry, root.nextSibling);
            }
            move(pantry, node, null);
            return;
        }
        node.remove();
    }

    /** @param {ParentNode & Node} parent @param {ParentNode & Node} source */
    function children(parent, source) {
        let cursor = parent.firstChild;
        for (const node of [...source.childNodes]) {
            const match = find(node, cursor, parent);
            if (!match) {
                insert(parent, node, cursor);
                continue;
            }
            if (match === cursor) cursor = cursor.nextSibling;
            else move(parent, match, cursor);
            update(match, node);
        }
        while (cursor) {
            const next = cursor.nextSibling;
            remove(cursor);
            cursor = next;
        }
    }

    if (options.children === false) {
        const el = next.firstElementChild;
        if (el && el.localName === root.localName && (!el.id || el.id === root.id)) update(root, el);
        else root.replaceWith(next);
    } else {
        children(root, next);
    }
    /** @type {HTMLElement | null} */ (pantry)?.remove();
}
