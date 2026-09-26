/**
 * What an app registers, as the tooling sees it: from the actions directory,
 * from the Vite plugin's manifest, or from a list of names in the
 * configuration.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scanActions } from './actions.js';
import { ConfigError } from './config.js';
import { isValid, splitName } from './names.js';

/**
 * @typedef {object} Registered
 * @property {string} name
 * @property {string[] | null} exports  null when unknown: a name from the configuration, or a module that re-exports everything
 * @property {string} [file]            absolute, when known
 * @property {Record<string, number>} [lines]  the line of each export, when known
 */

/**
 * @typedef {object} Registry
 * @property {Map<string, Registered>} modules
 * @property {string} source            where the names came from, for messages
 * @property {import('./check.js').Problem[]} problems  what is wrong with the registry itself
 */

/** The manifest the Vite plugin writes, and `cyclewire check --manifest` reads. */
export const MANIFEST_VERSION = 1;

/**
 * @param {import('./config.js').Config} config
 * @returns {Promise<Registry>}
 */
export async function loadRegistry(config) {
    /** @type {Map<string, Registered>} */
    const modules = new Map();
    /** @type {import('./check.js').Problem[]} */
    const problems = [];

    if (config.manifest) {
        const path = resolve(config.root, config.manifest);
        /** @type {any} */
        let manifest;
        try {
            manifest = JSON.parse(await readFile(path, 'utf8'));
        } catch {
            throw new ConfigError(`Cannot read the manifest ${config.manifest}: build the app with the cyclewire/vite plugin first.`);
        }
        if (manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest.actions)) throw new ConfigError(`${config.manifest} is not a manifest written by cyclewire/vite.`);
        for (const entry of manifest.actions) modules.set(entry.name, { name: entry.name, exports: entry.star ? null : entry.exports, file: resolve(config.root, entry.file) });
        return { modules, source: config.manifest, problems };
    }

    if (config.names) {
        for (const action of config.names) {
            if (!isValid(action)) throw new ConfigError(`"${action}" in "names" is not a valid action name.`);
            const [name, exported] = splitName(action);
            const known = modules.get(name);
            // "cart#add" says the export exists; "cart" alone says nothing about exports.
            if (exported) modules.set(name, { name, exports: [...(known?.exports ?? []), exported] });
            else if (!known) modules.set(name, { name, exports: null });
        }
        return { modules, source: '"names" in the configuration', problems };
    }

    if (!config.actions) throw new ConfigError('No actions found. Set "actions" to your actions directory, "names" to the registered names, or "manifest" to the Vite plugin\'s manifest.');
    const { modules: found, duplicates, invalid } = await scanActions(config.actions, { root: config.root });
    const registry = registryOf(found, config.actions);
    for (const [name, files] of duplicates) {
        problems.push({ severity: 'warning', code: 'duplicate-name', message: `${files.join(' and ')} are both named "${name}"; the last one registered wins.`, file: `${config.actions}/${files.at(-1)}` });
    }
    for (const path of invalid) {
        problems.push({ severity: 'warning', code: 'invalid-file-name', message: `The name of ${path} is not a valid action name, so it cannot be registered. Use letters, digits, "_", "-" and ".".`, file: `${config.actions}/${path}` });
    }
    return { ...registry, problems };
}

/**
 * The registry of the modules found in an actions directory.
 * @param {import('./actions.js').ActionModule[]} found
 * @param {string} source
 * @returns {Registry}
 */
export function registryOf(found, source) {
    /** @type {Map<string, Registered>} */
    const modules = new Map();
    for (const module of found) modules.set(module.name, { name: module.name, exports: module.star ? null : module.exports, file: module.file, lines: module.lines });
    return { modules, source, problems: [] };
}
