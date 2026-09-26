/**
 * The action modules in a directory, named as `fromGlob()` names them, with
 * their exports: what the registry of an app built with
 * `fromGlob(import.meta.glob('./actions/**'))`, or with the Vite plugin,
 * contains.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exportsOf } from './exports.js';
import { walk } from './files.js';
import { EXTENSION, isValid, nameOf } from './names.js';

/**
 * @typedef {object} ActionModule
 * @property {string} name        the module name, e.g. `cart.add` for cart/add.js
 * @property {string} file        absolute path
 * @property {string} path        path relative to the actions directory, with forward slashes
 * @property {string[]} exports   its value exports, `default` included
 * @property {Record<string, number>} lines  the line of each export
 * @property {boolean} star       re-exports everything from another module, so `exports` may be incomplete
 */

/** Files that are never action modules: hidden ones, which globs skip too, and type declarations. */
const NOT_ACTIONS = /(?:^|\/)\.|\.d\.[cm]?ts$/;

/**
 * @param {string} dir the actions directory
 * @param {object} [options]
 * @param {string} [options.root] what `dir` is relative to; the working directory by default
 * @param {string[]} [options.extensions] which files count, `['.js', '.ts', …]` by default: every script
 * @returns {Promise<{ modules: ActionModule[], duplicates: [string, string[]][], invalid: string[] }>}
 *     the modules; the names more than one file claims (the last one wins, as in `fromGlob()`); files whose name the registry would refuse
 */
export async function scanActions(dir, { root = process.cwd(), extensions } = {}) {
    const absolute = resolve(root, dir);
    const accept = (/** @type {string} */ path) => (extensions ? extensions.some((extension) => path.endsWith(extension)) : EXTENSION.test(path));
    const paths = (await walk(absolute)).filter((path) => accept(path) && !NOT_ACTIONS.test(path));
    /** @type {Map<string, ActionModule>} */
    const byName = new Map();
    /** @type {Map<string, string[]>} */
    const claims = new Map();
    /** @type {string[]} */
    const invalid = [];
    for (const path of paths) {
        const name = nameOf(path, '');
        if (!isValid(name) || name.includes('#')) {
            invalid.push(path);
            continue;
        }
        const file = join(absolute, path);
        const { exports, star } = exportsOf(await readFile(file, 'utf8'));
        byName.set(name, { name, file, path, exports: exports.map((item) => item.name), lines: Object.fromEntries(exports.map((item) => [item.name, item.line])), star });
        claims.set(name, [...(claims.get(name) ?? []), path]);
    }
    return {
        modules: [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
        duplicates: [...claims].filter(([, files]) => files.length > 1),
        invalid,
    };
}
