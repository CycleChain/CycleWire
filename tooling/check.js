/**
 * Checks the `cw-*` values in templates against the registry: every
 * action must be registered and export what the markup names, and triggers,
 * preloads, concurrency, debounce, props and swaps must hold values CycleWire
 * understands. Values the template language builds cannot be checked and are
 * counted instead.
 */
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { glob } from './files.js';
import { handlerOf, isValid, splitName, suggest } from './names.js';
import { loadRegistry } from './registry.js';
import { referencesIn, syntaxOf } from './templates.js';

/**
 * @typedef {object} Problem
 * @property {'error' | 'warning'} severity
 * @property {string} code
 * @property {string} message
 * @property {string} [file]    relative to the root, with forward slashes
 * @property {number} [line]
 * @property {number} [column]
 */

/**
 * @typedef {object} Report
 * @property {Problem[]} problems   sorted by file and position
 * @property {number} files         templates read
 * @property {number} references    values checked
 * @property {number} dynamic       values the template language builds, not checked
 * @property {string} source        where the registered names came from
 */

const TRIGGER = /^(?:load|idle|visible|media:\s*\(.+\))$/;
const PRELOAD = /^(?:intent|visible|idle|load|none)$/;
const CONCURRENCY = /^(?:drop|restart|latest|parallel)$/;
const SWAP = /^(?:inner|outer|before|after|prepend|append|morph|remove|none)(?:\s+transition)?$/;

/**
 * What is wrong with a value that is not an action, or null.
 * @param {import('./templates.js').Reference} reference
 * @returns {[string, string] | null} the problem's code and message
 */
function invalidValue({ kind, attribute, value }) {
    const text = (value ?? '').trim();
    if (kind === 'trigger' && !TRIGGER.test(text)) return ['invalid-trigger', `${attribute}="${text}" is not a trigger: use load, idle, visible or media:(query).`];
    if (kind === 'preload' && text && !PRELOAD.test(text)) return ['invalid-preload', `${attribute}="${text}" is not a preload: use intent, visible, idle, load or none.`];
    if (kind === 'concurrency' && !CONCURRENCY.test(text)) return ['invalid-concurrency', `${attribute}="${text}" is not a concurrency mode: use drop, restart, latest or parallel.`];
    if (kind === 'debounce' && !/^\d+$/.test(text)) return ['invalid-debounce', `${attribute}="${text}" is not a number of milliseconds.`];
    if (kind === 'swap' && text && !SWAP.test(text)) return ['invalid-swap', `${attribute}="${text}" is not a swap: use inner, outer, before, after, prepend, append, morph, remove or none, and transition after it if you like.`];
    if (kind === 'props' && text) {
        try {
            JSON.parse(text);
        } catch (error) {
            return ['invalid-props', `${attribute} is not valid JSON: ${/** @type {Error} */ (error).message}`];
        }
    }
    return null;
}

/**
 * What is wrong with an action name, or null.
 * @param {string} action
 * @param {import('./registry.js').Registry} registry
 * @returns {[string, string] | null}
 */
function invalidAction(action, registry) {
    if (!isValid(action)) return ['invalid-name', `"${action}" is not a valid action name: a module name made of letters, digits, "_", "-" and ".", optionally followed by #export.`];
    const [name, exported] = splitName(action);
    const found = registry.modules.get(name);
    if (!found) {
        const everything = [...registry.modules.values()].flatMap((module) => [module.name, ...(module.exports ?? []).filter((item) => item !== 'default').map((item) => `${module.name}#${item}`)]);
        const close = suggest(action, everything);
        return ['unknown-action', `"${action}" is not registered${close.length ? `; did you mean ${close.map((item) => `"${item}"`).join(' or ')}?` : ` (the registry comes from ${registry.source}).`}`];
    }
    if (!found.exports) return null;
    if (handlerOf(exported, found.exports)) return null;
    if (exported) {
        const close = suggest(exported, found.exports.filter((item) => item !== 'default'));
        return ['unknown-export', `"${name}" has no export "${exported}"${close.length ? `; did you mean ${close.map((item) => `"${name}#${item}"`).join(' or ')}?` : '.'}`];
    }
    const named = found.exports.filter((item) => item !== 'default');
    return ['no-handler', `"${name}" has no run or default export${named.length ? `; name one, as in "${name}#${named[0]}".` : '.'}`];
}

/**
 * Checks one template.
 * @param {string} source
 * @param {object} options
 * @param {string} options.file                              relative to the root, for the problems' positions
 * @param {import('./registry.js').Registry} options.registry
 * @param {string} [options.prefix]
 * @param {Set<string>} [options.used]                       collects the actions it names
 * @returns {{ problems: Problem[], references: number, dynamic: number }}
 */
export function checkTemplate(source, { file, registry, prefix = 'cw-', used = new Set() }) {
    /** @type {Problem[]} */
    const problems = [];
    let references = 0;
    let dynamic = 0;
    for (const reference of referencesIn(source, { syntax: syntaxOf(file), prefix })) {
        if (reference.value === null) {
            dynamic++;
            continue;
        }
        references++;
        const at = { file, line: reference.line, column: reference.column };
        if (reference.kind === 'action') {
            const action = reference.value.trim();
            const wrong = invalidAction(action, registry);
            if (wrong) problems.push({ severity: 'error', code: wrong[0], message: wrong[1], ...at });
            else used.add(action);
        } else {
            const wrong = invalidValue(reference);
            if (wrong) problems.push({ severity: 'error', code: wrong[0], message: wrong[1], ...at });
        }
    }
    return { problems, references, dynamic };
}

/**
 * @param {import('./config.js').Config} config
 * @param {object} [options]
 * @param {boolean} [options.unused] also warn about the actions no template uses
 * @returns {Promise<Report>}
 */
export async function check(config, { unused = false } = {}) {
    const registry = await loadRegistry(config);
    /** @type {Problem[]} */
    const problems = [...registry.problems];
    const files = await glob(config.templates, config.root);
    let references = 0;
    let dynamic = 0;
    /** @type {Set<string>} */
    const used = new Set();

    for (const file of files) {
        const found = checkTemplate(await readFile(join(config.root, file), 'utf8'), { file, registry, prefix: config.prefix, used });
        problems.push(...found.problems);
        references += found.references;
        dynamic += found.dynamic;
    }

    if (unused) {
        for (const module of registry.modules.values()) {
            if (!module.exports) continue;
            // A bare name runs `run`, or else the default export.
            const bare = handlerOf('', module.exports);
            for (const exported of module.exports) {
                if (used.has(`${module.name}#${exported}`) || (exported === bare && used.has(module.name))) continue;
                // With a run export, the default export is not an action a bare name reaches.
                if (exported === 'default' && bare === 'run') continue;
                const name = exported === bare ? module.name : `${module.name}#${exported}`;
                problems.push({
                    severity: 'warning',
                    code: 'unused-action',
                    message: `"${name}" is not used by any template.`,
                    ...(module.file ? { file: relative(config.root, module.file).split(sep).join('/'), line: module.lines?.[exported] } : {}),
                });
            }
        }
    }

    const order = (/** @type {Problem} */ a, /** @type {Problem} */ b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0);
    return { problems: problems.sort(order), files: files.length, references, dynamic, source: registry.source };
}
