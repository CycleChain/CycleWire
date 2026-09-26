/**
 * The tooling's configuration: JSON only, so reading it never runs a
 * project's code. Taken from `cyclewire.config.json`, or the `cyclewire` key
 * of package.json, then from the command line.
 *
 *   {
 *     "actions": "src/actions",            the actions directory, named as fromGlob() names it
 *     "names": ["cart", "search#run"],     or the registered names, when there is no such directory
 *     "manifest": "public/build/.vite/cyclewire.json",   or the Vite plugin's manifest
 *     "templates": ["resources/views/**\/*.blade.php"],
 *     "prefix": "cw-",
 *     "types": "cyclewire-actions.d.ts"
 *   }
 */
import { readFile, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';

/**
 * @typedef {object} Config
 * @property {string} root                 absolute
 * @property {string | null} actions       relative to root
 * @property {string[] | null} names
 * @property {string | null} manifest      relative to root
 * @property {string[]} templates
 * @property {string} prefix
 * @property {string} types                relative to root: next to the actions directory by default
 * @property {string | null} file          where the configuration came from
 */

/** Where apps built with common stacks keep their actions, in the order they are tried. */
export const ACTION_DIRS = ['src/actions', 'resources/js/actions', 'app/javascript/actions', 'assets/js/actions', 'static/js/actions', 'js/actions', 'actions'];

/** Templates of every supported language, and scripts that render markup. */
export const TEMPLATES = [
    '**/*.{html,htm,blade.php,erb,haml,slim,twig,jinja,jinja2,j2,njk,liquid,hbs,handlebars,mustache,jsx,tsx,vue,svelte,astro}',
    'src/**/*.{js,mjs,ts,mts}',
];

const KEYS = new Set(['actions', 'names', 'manifest', 'templates', 'prefix', 'types']);

/** A configuration problem: the command line tool exits with status 2. */
export class ConfigError extends Error {}

const exists = (/** @type {string} */ path) => stat(path).then(() => true, () => false);

/** @param {string} path */
async function json(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        throw new ConfigError(`${path} is not valid JSON: ${/** @type {Error} */ (error).message}`);
    }
}

/**
 * @param {object} [overrides] values from the command line
 * @param {string} [overrides.root]
 * @param {string} [overrides.config] a configuration file to use instead of looking for one
 * @param {string} [overrides.actions]
 * @param {string[]} [overrides.names]
 * @param {string} [overrides.manifest]
 * @param {string[]} [overrides.templates]
 * @param {string} [overrides.prefix]
 * @param {string} [overrides.types]
 * @returns {Promise<Config>}
 */
export async function loadConfig(overrides = {}) {
    const root = resolve(overrides.root ?? process.cwd());
    /** @type {Record<string, unknown>} */
    let found = {};
    /** @type {string | null} */
    let file = null;
    if (overrides.config) {
        file = resolve(root, overrides.config);
        if (!(await exists(file))) throw new ConfigError(`${overrides.config} does not exist.`);
        found = await json(file);
    } else if (await exists(join(root, 'cyclewire.config.json'))) {
        file = join(root, 'cyclewire.config.json');
        found = await json(file);
    } else if (await exists(join(root, 'package.json'))) {
        const pkg = await json(join(root, 'package.json'));
        if (pkg && typeof pkg.cyclewire === 'object') {
            file = join(root, 'package.json');
            found = pkg.cyclewire;
        }
    }
    if (!found || typeof found !== 'object' || Array.isArray(found)) throw new ConfigError(`${file}: the configuration must be a JSON object.`);
    for (const key of Object.keys(found)) {
        if (!KEYS.has(key)) throw new ConfigError(`${file}: unknown option "${key}". Known options: ${[...KEYS].join(', ')}.`);
    }
    const given = { ...found, ...Object.fromEntries(Object.entries(overrides).filter(([key, value]) => KEYS.has(key) && value !== undefined)) };

    const text = (/** @type {string} */ key) => {
        const value = given[key];
        if (value !== undefined && typeof value !== 'string') throw new ConfigError(`"${key}" must be a string.`);
        return /** @type {string | undefined} */ (value);
    };
    const list = (/** @type {string} */ key) => {
        const value = given[key];
        if (value === undefined) return undefined;
        const items = typeof value === 'string' ? [value] : value;
        if (!Array.isArray(items) || !items.every((item) => typeof item === 'string')) throw new ConfigError(`"${key}" must be a string or a list of strings.`);
        return items;
    };

    let actions = text('actions') ?? null;
    const names = list('names') ?? null;
    const manifest = text('manifest') ?? null;
    if (!actions && !names && !manifest) {
        for (const dir of ACTION_DIRS) {
            if (await exists(join(root, dir))) {
                actions = dir;
                break;
            }
        }
    }
    const prefix = text('prefix') ?? 'cw-';
    if (!/^(?:[a-z0-9-]*-)?$/.test(prefix)) throw new ConfigError(`"prefix" must be empty or letters, digits and hyphens ending in "-", as in "cw-".`);
    return {
        root,
        actions,
        names,
        manifest,
        templates: list('templates') ?? TEMPLATES,
        prefix,
        types: text('types') ?? (actions ? posix.join(posix.dirname(actions.replace(/\\/g, '/')), 'cyclewire-actions.d.ts') : 'cyclewire-actions.d.ts'),
        file,
    };
}
