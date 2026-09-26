/**
 * Finding files without a dependency: a directory walk, and glob patterns
 * with `*`, `**`, `?` and `{a,b}`. Paths are reported relative to the root,
 * with forward slashes on every platform.
 */
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Directories no pattern looks into unless it names them. */
export const SKIPPED = ['node_modules', '.git', 'vendor', 'dist', 'build', 'coverage'];

/** @param {string} path */
export const slash = (path) => path.split(sep).join('/');

/**
 * Every file under `dir`, sorted, as paths relative to `root`.
 * @param {string} dir absolute
 * @param {string} root absolute
 * @param {(name: string) => boolean} [enter] whether to walk into a directory
 * @returns {Promise<string[]>}
 */
export async function walk(dir, root = dir, enter = () => true) {
    /** @type {string[]} */
    const found = [];
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (enter(entry.name)) found.push(...await walk(path, root, enter));
        } else if (entry.isFile()) {
            found.push(slash(relative(root, path)));
        }
    }
    return found;
}

/**
 * A pattern as a regular expression over forward-slash paths: `**` spans
 * directories, `*` and `?` stay within one, `{a,b}` offers alternatives.
 * @param {string} pattern
 */
export function toRegExp(pattern) {
    let source = '';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '*' && pattern[i + 1] === '*') {
            // `**/` matches no directory or any number of them.
            if (pattern[i + 2] === '/') {
                source += '(?:.*/)?';
                i += 2;
            } else {
                source += '.*';
                i++;
            }
        } else if (char === '*') source += '[^/]*';
        else if (char === '?') source += '[^/]';
        else if (char === '{') {
            const end = pattern.indexOf('}', i);
            if (end < 0) source += '\\{';
            else {
                source += `(?:${pattern.slice(i + 1, end).split(',').map((part) => part.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
                i = end;
            }
        } else source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${source}$`);
}

/** The part of a pattern before its first wildcard: the directory to walk. */
const baseOf = (/** @type {string} */ pattern) => {
    const parts = pattern.split('/');
    const fixed = [];
    for (const part of parts.slice(0, -1)) {
        if (/[*?{]/.test(part)) break;
        fixed.push(part);
    }
    return fixed.join('/');
};

/**
 * The files matching any of the patterns (a leading `!` excludes), relative
 * to `root`, sorted and without duplicates. Directories in `SKIPPED` are
 * only walked when a pattern names them.
 * @param {string | string[]} patterns
 * @param {string} root absolute
 * @returns {Promise<string[]>}
 */
export async function glob(patterns, root) {
    const list = [patterns].flat().map((pattern) => slash(pattern).replace(/^\.\//, ''));
    const include = list.filter((pattern) => !pattern.startsWith('!'));
    const exclude = list.filter((pattern) => pattern.startsWith('!')).map((pattern) => toRegExp(pattern.slice(1)));
    /** @type {Set<string>} */
    const found = new Set();
    for (const pattern of include) {
        const matcher = toRegExp(pattern);
        const base = baseOf(pattern);
        const named = new Set(pattern.split('/'));
        const files = await walk(join(root, base), root, (name) => !SKIPPED.includes(name) || named.has(name));
        for (const file of files) if (matcher.test(file) && !exclude.some((regexp) => regexp.test(file))) found.add(file);
    }
    return [...found].sort();
}
