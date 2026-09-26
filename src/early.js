/**
 * cyclewire/early — keeps what people do before CycleWire starts.
 *
 * A few hundred bytes of classic script for the top of <head>. Until
 * CycleWire starts, it notes the clicks, inputs and changes on anything the
 * page binds, and marks a tapped control as pending so the tap shows. When
 * start() runs, it takes the notes and runs them in order, as if they had
 * just happened. Links and forms are left to the browser, which follows them
 * without waiting for anyone.
 *
 *   <head>
 *     <script>${earlyScript()}</script>        from Node: import { earlyScript } from 'cyclewire/early'
 *     …
 *
 * Or inline dist/early.min.js, the same script with the default prefix.
 */

/**
 * The script. It runs in the page from its source text, so it uses nothing
 * but its argument, and stays as small as it reads.
 * @param {string} prefix the attribute prefix, "cw-" unless start() is told otherwise
 */
export function capture(prefix) {
    const key = Symbol.for('cyclewire.early');
    const global = /** @type {any} */ (window);
    if (global[key]) return;
    /** @type {[Event, EventTarget[], Element | undefined][]} */
    const queue = [];
    const types = ['click', 'input', 'change'];
    /** @param {any} node @param {string} name */
    const has = (node, name) => node.hasAttribute && node.hasAttribute(prefix + name);
    /** @param {Event} event */
    const note = (event) => {
        const path = event.composedPath();
        const type = event.type;
        if (path.some((node) => has(node, 'ignore')) || !path.some((node) => /** @type {any} */ (node).getAttributeNames?.().some((/** @type {string} */ name) => name.startsWith(prefix)))) return;
        // A later input supersedes the one before from the same field.
        if (type !== 'click') for (let i = queue.length; i--; ) if (queue[i][0].type === type && queue[i][1][0] === path[0]) queue.splice(i, 1);
        // The control the click will run, as start() finds it: one with its own
        // cw-on-click, or a cw-action clicks run (not a form's, a field's or a trigger's).
        const el = type === 'click' ? /** @type {Element | undefined} */ (path.find((node) => has(node, 'on-click') || has(node, 'action') && !has(node, 'trigger') && (/** @type {any} */ (node).localName === 'input' ? /^(button|submit|reset|image)$/.test(/** @type {any} */ (node).type) : !/^(form|select|textarea|details)$/.test(/** @type {any} */ (node).localName)))) : undefined;
        if (el) el.setAttribute(prefix + 'pending', '');
        if (queue.length < 50) queue.push([event, path, el]);
    };
    for (const type of types) document.addEventListener(type, note, true);
    // start() takes the notes, once. The pending marks go with them: a run
    // puts its own back, and a note that does not run should not keep one.
    global[key] = () => {
        delete global[key];
        for (const type of types) document.removeEventListener(type, note, true);
        for (const [, , el] of queue) el?.removeAttribute(prefix + 'pending');
        return queue;
    };
}

/**
 * The script for a page, as text to put in a <script> element.
 * @param {string} [prefix] the attribute prefix the page's start() uses
 * @returns {string}
 */
export const earlyScript = (prefix = 'cw-') => `(${capture})(${JSON.stringify(prefix)})`;
