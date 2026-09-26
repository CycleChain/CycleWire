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
 * @property {string} [key]        attribute that pairs siblings without ids. Default "cw-key"
 * @property {string} [preserve]   attribute marking elements to leave untouched. Default "cw-preserve"
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
 * The positions of a longest increasing run of `values`, skipping negative
 * ones: the pairs already in order, which a morph leaves where they are.
 * @param {number[]} values
 * @returns {Set<number>}
 */
function increasing(values) {
    /** Positions of the smallest tail of each run length. @type {number[]} */
    const tails = [];
    /** @type {number[]} */
    const before = [];
    values.forEach((value, i) => {
        if (value < 0) return;
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (values[tails[mid]] < value) low = mid + 1;
            else high = mid;
        }
        before[i] = low ? tails[low - 1] : -1;
        tails[low] = i;
    });
    const keep = new Set();
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = before[i]) keep.add(i);
    return keep;
}

/**
 * @param {Element} root
 * @param {DocumentFragment} next
 * @param {MorphOptions} options
 * @param {Element | null} focused  the element focused before the morph; a plain
 *   insertBefore() (no moveBefore) blurs it, so the live activeElement cannot be trusted
 */
function run(root, next, options, focused) {
    const keyAttr = options.key || 'cw-key';
    const preserveAttr = options.preserve || 'cw-preserve';
    // An old node equal to its new markup is left alone, subtree and all,
    // which the browser checks faster than a walk could. Not when the new
    // content has a <template>: equality does not look into its content.
    const skipEqual = !next.querySelector('template');

    // Old elements whose id reappears in the new content are paired by id,
    // wherever they sit, and moved into place rather than recreated.
    /** @type {Set<string>} */
    const wanted = new Set();
    for (const el of next.querySelectorAll('[id]')) wanted.add(el.id);
    /** @type {Map<string, Element>} */
    const byId = new Map();
    if (root.id && wanted.has(root.id)) byId.set(root.id, root);
    for (const el of root.querySelectorAll('[id]')) if (wanted.has(el.id)) byId.set(el.id, el);
    /** Old nodes already paired; the set lives only as long as this morph. @type {Set<Node>} */
    const used = new Set();
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

    /** @param {Element} from @param {Element} to */
    function attributes(from, to) {
        const input = from.localName === 'input';
        const option = from.localName === 'option';
        // What the server said before, for the properties that follow it.
        const value = input && from.getAttribute('value');
        const checked = input && from.hasAttribute('checked');
        const selected = option && from.hasAttribute('selected');
        // getAttributeNames() makes no Attr nodes, unlike reading .attributes.
        for (const name of from.getAttributeNames()) if (!to.hasAttribute(name)) from.removeAttribute(name);
        for (const name of to.getAttributeNames()) {
            const next = to.getAttribute(name);
            if (from.getAttribute(name) === next) continue;
            // A prefixed name, such as xlink:href, keeps its namespace.
            const ns = name.includes(':') && /** @type {Attr} */ (to.getAttributeNode(name)).namespaceURI;
            if (ns) from.setAttributeNS(ns, name, /** @type {string} */ (next));
            else from.setAttribute(name, /** @type {string} */ (next));
        }
        // Properties follow attributes only when the server changed them, and
        // never under the user's cursor.
        if (from === focused) return;
        const control = /** @type {any} */ (from);
        if (input) {
            if (from.getAttribute('value') !== value) control.value = to.getAttribute('value') ?? '';
            if (from.hasAttribute('checked') !== checked) control.checked = to.hasAttribute('checked');
        } else if (option && from.hasAttribute('selected') !== selected) {
            control.selected = to.hasAttribute('selected');
        }
    }

    /** @param {Node} from @param {Node} to */
    function update(from, to) {
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

    /**
     * @param {ParentNode & Node} parent @param {Node} node @param {Node | null} ref
     * @returns {Node} what was placed
     */
    function insert(parent, node, ref) {
        // A new element that contains ids from the old tree is rebuilt around them.
        if (node.nodeType === 1 && byId.size && holdsNeeded(/** @type {Element} */ (node))) {
            const shell = /** @type {Element} */ (node.cloneNode(false));
            parent.insertBefore(shell, ref);
            children(shell, /** @type {Element} */ (node));
            return shell;
        }
        return parent.insertBefore(node, ref);
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

    /**
     * Pairs the new children with old ones, removes the old ones left over,
     * leaves in place the longest run of pairs already in order, and moves or
     * inserts the rest: a swap of two rows moves two rows, not every row
     * between them.
     * @param {ParentNode & Node} parent @param {ParentNode & Node} source
     */
    function children(parent, source) {
        const olds = [...parent.childNodes];
        const news = [...source.childNodes];
        /** Where each old child is, made when a pair is found by id or key. @type {Map<Node, number> | null} */
        let at = null;
        /** Old children with a key, by key, made when a new child has one. @type {Map<string, Element[]> | null} */
        let keyed = null;
        // The old child after the last one paired here, where a node without
        // an id or a key is looked for first.
        let pos = 0;
        // Whether every pair so far is in the old order: then nothing moves.
        let ordered = true;
        let last = -1;

        /** @param {Node} old @returns {number} where `old` is among the old children, or -1 */
        const index = (old) => {
            if (!at) {
                at = new Map();
                olds.forEach((node, i) => /** @type {Map<Node, number>} */ (at).set(node, i));
            }
            return at.get(old) ?? -1;
        };

        /** @param {Node} node @returns {[Node, number] | null} the old node that becomes `node`, and where it is */
        const pair = (node) => {
            const here = olds[pos];
            if (node.nodeType !== 1) return here && here.nodeType === node.nodeType && !used.has(here) ? [here, pos] : null;
            const el = /** @type {Element} */ (node);
            if (el.id) {
                const old = byId.get(el.id);
                return old && !used.has(old) && old.localName === el.localName && !old.contains(parent) ? [old, index(old)] : null;
            }
            const key = el.getAttribute(keyAttr);
            if (key !== null) {
                if (!keyed) {
                    keyed = new Map();
                    for (const old of olds) {
                        const k = old.nodeType === 1 ? /** @type {Element} */ (old).getAttribute(keyAttr) : null;
                        if (k !== null) keyed.set(k, [...(keyed.get(k) || []), /** @type {Element} */ (old)]);
                    }
                }
                const old = keyed.get(key)?.find((candidate) => !used.has(candidate) && candidate.localName === el.localName);
                return old ? [old, index(old)] : null;
            }
            // Without an id or a key: the next old element of the same kind.
            for (let i = pos; i < olds.length; i++) {
                const old = /** @type {Element} */ (olds[i]);
                if (old.nodeType === 1 && !used.has(old) && old.localName === el.localName && !reserved(old)) return [old, i];
            }
            return null;
        };

        /** @type {(Node | null)[]} */
        const matches = [];
        /** Old positions of the pairs; -1 for nodes from elsewhere or none. @type {number[]} */
        const from = [];
        for (const node of news) {
            const found = pair(node);
            const i = found ? found[1] : -1;
            if (found) {
                used.add(found[0]);
                if (i >= 0) {
                    pos = i + 1;
                    if (i < last) ordered = false;
                    last = i;
                } else ordered = false;
            }
            matches.push(found && found[0]);
            from.push(i);
        }
        for (const old of olds) if (!used.has(old) && old.parentNode === parent) remove(old);
        const stay = ordered ? null : increasing(from);
        /** @type {Node | null} */
        let ref = null;
        for (let i = news.length; i--; ) {
            const match = matches[i];
            if (!match) {
                ref = insert(parent, news[i], ref);
                continue;
            }
            if (stay ? !stay.has(i) : from[i] < 0) move(parent, match, ref);
            if (!(skipEqual && match.isEqualNode(news[i]))) update(match, news[i]);
            ref = match;
        }
        // A node kept by beforeRemove stays after the new content, as it was.
        for (const old of olds) if (!used.has(old) && old.parentNode === parent) move(parent, old, null);
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
