/**
 * cyclewire/css — stylesheets that arrive with the actions that need them.
 *
 *   import { start } from 'cyclewire';
 *   import { styles } from 'cyclewire/css';
 *
 *   start({
 *       actions: { datepicker: { module: '/js/datepicker.js', css: '/css/datepicker.css' } },
 *       plugins: [styles()],
 *   });
 *
 * The stylesheet is fetched with the module when intent appears and applied
 * before the handler runs, so the UI an action creates never shows up
 * unstyled. `css()` loads stylesheets from code. Only registry entries and
 * code name stylesheet URLs; markup never does.
 */
import { link } from './util.js';

/** Applied stylesheets per root (document or shadow root). @type {WeakMap<Node, Map<string, Promise<void>>>} */
const applied = new WeakMap();
/** @type {Set<string>} */
const preloaded = new Set();

/** @param {string} href */
const resolve = (href) => new URL(href, document.baseURI).href;

/**
 * The document or shadow root a node lives in; detached nodes use the document.
 * @param {Node} node
 * @returns {Document | ShadowRoot}
 */
function rootOf(node) {
    const root = /** @type {any} */ (node.getRootNode());
    return root.host || root.nodeType === 9 ? root : document;
}

/**
 * Fetches a stylesheet without applying it.
 * @param {string} url absolute
 */
function preloadStyle(url) {
    if (preloaded.has(url)) return;
    preloaded.add(url);
    const hint = link('preload', url);
    hint.as = 'style';
    document.head.append(hint);
}

/**
 * Applies a stylesheet to a root once and resolves when it is in effect. A
 * matching stylesheet the server already rendered is reused. New links go
 * before the root's first stylesheet, so the page's own CSS wins at equal
 * specificity, as with any vendor stylesheet. A failed load rejects and is
 * forgotten, so the next attempt retries.
 * @param {string} url absolute
 * @param {Document | ShadowRoot} root
 * @returns {Promise<void>}
 */
function stylesheet(url, root) {
    let cache = applied.get(root);
    if (!cache) applied.set(root, (cache = new Map()));
    let promise = cache.get(url);
    if (promise) return promise;
    const links = /** @type {HTMLLinkElement[]} */ ([...root.querySelectorAll('link[rel~="stylesheet"]')]);
    if (links.some((link) => link.href === url && link.sheet)) {
        promise = Promise.resolve();
    } else {
        promise = new Promise((resolve, reject) => {
            const sheet = link('stylesheet', url);
            sheet.onload = () => resolve();
            sheet.onerror = () => {
                cache.delete(url);
                sheet.remove();
                reject(new Error(`[CycleWire] CSS failed: ${url}`));
            };
            const first = root.querySelector('link[rel~="stylesheet"], style');
            if (first) first.before(sheet);
            else (root.nodeType === 9 ? document.head : root).append(sheet);
        });
    }
    cache.set(url, promise);
    return promise;
}

/**
 * Loads stylesheets into a document or shadow root, once each, and resolves
 * when they apply. For styles an action decides on at run time; stylesheets
 * known up front belong in the registry: `{ module, css }`.
 * @param {string | string[]} href  resolved against the page
 * @param {Node} [root]  a document, a shadow root, or any node inside one
 * @returns {Promise<void>}
 */
export function css(href, root = document) {
    const target = rootOf(root);
    const list = Array.isArray(href) ? href : [href];
    return Promise.all(list.map((item) => stylesheet(resolve(item), target))).then(() => {});
}

/**
 * The stylesheets a registry entry lists: `{ module, css: url | url[] }`.
 * @param {unknown} entry
 * @returns {string[]}
 */
const listed = (entry) => {
    const value = entry && typeof entry === 'object' ? /** @type {{ css?: string | string[] }} */ (entry).css : undefined;
    return value ? /** @type {string[]} */ ([]).concat(value) : [];
};

/**
 * The plugin behind `{ module, css }` registry entries. It preloads an
 * action's stylesheets with its module and applies them to the element's
 * document or shadow root before the handler runs. A stylesheet that fails
 * to load fails the run (`cw:error`); the next interaction retries it.
 * @returns {import('./index.js').Plugin}
 */
export const styles = () => ({
    preload(entry) {
        for (const href of listed(entry)) preloadStyle(resolve(href));
    },
    load(entry, element) {
        const list = listed(entry);
        return list.length ? css(list, element) : undefined;
    },
});
