/**
 * Action names, by the same rules as the browser: `fromGlob()` in
 * src/index.js turns a file path into a name, and src/registry.js decides
 * which names and exports are valid. test/tooling/names.test.js keeps the
 * two in step.
 */

/** A module name: letters, digits, `_`, `-` and `.`. */
export const NAME = /^[\w.-]+$/;
/** An export name, possibly empty: letters, digits, `_` and `$`. */
export const EXPORT = /^[\w$]*$/;

/** The extensions `fromGlob()` strips. */
export const EXTENSION = /\.[cm]?[jt]sx?$/;

/**
 * The action name `fromGlob()` gives a file: `./actions/cart/add.js` becomes
 * `cart.add`, and `./actions/cart/index.js` becomes `cart`.
 * @param {string} path the path as the glob reports it, with forward slashes
 * @param {string} [base] the prefix to strip
 */
export function nameOf(path, base = './actions/') {
    return (path.startsWith(base) ? path.slice(base.length) : path)
        .replace(EXTENSION, '')
        .replace(/\/index$/, '')
        .replace(/\//g, '.');
}

/**
 * Splits `module#export`; the export is empty when there is none.
 * @param {string} action
 * @returns {[string, string]}
 */
export function splitName(action) {
    const hash = action.indexOf('#');
    return hash < 0 ? [action, ''] : [action.slice(0, hash), action.slice(hash + 1)];
}

/**
 * Whether the browser would accept this as an action: a valid module name,
 * and a valid export if there is one.
 * @param {string} action
 */
export function isValid(action) {
    const [name, exported] = splitName(action);
    return NAME.test(name) && EXPORT.test(exported);
}

/**
 * The handler a name runs: its export, or `run`, or the default export.
 * @param {string} exported the part after `#`, possibly empty
 * @param {Iterable<string>} exports what the module exports
 * @returns {string | null}
 */
export function handlerOf(exported, exports) {
    const names = new Set(exports);
    if (exported) return names.has(exported) ? exported : null;
    return names.has('run') ? 'run' : names.has('default') ? 'default' : null;
}

/**
 * The closest candidates to a misspelt name, best first: Damerau-Levenshtein
 * distance, at most a third of the name's length (and at least 1).
 * @param {string} wrong
 * @param {Iterable<string>} candidates
 * @param {number} [limit]
 */
export function suggest(wrong, candidates, limit = 3) {
    const most = Math.max(1, Math.floor(wrong.length / 3));
    return [...new Set(candidates)]
        .map((candidate) => [candidate, distance(wrong.toLowerCase(), candidate.toLowerCase())])
        .filter(([, d]) => /** @type {number} */ (d) <= most)
        .sort((a, b) => /** @type {number} */ (a[1]) - /** @type {number} */ (b[1]) || String(a[0]).localeCompare(String(b[0])))
        .slice(0, limit)
        .map(([candidate]) => /** @type {string} */ (candidate));
}

/**
 * Edits between two strings, counting a swap of neighbours as one.
 * @param {string} a
 * @param {string} b
 */
export function distance(a, b) {
    /** @type {number[][]} */
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}
