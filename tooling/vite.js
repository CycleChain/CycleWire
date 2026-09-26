/**
 * `cyclewire/vite`: registers every file of an actions directory as its own
 * chunk, re-registers an action when its file changes instead of reloading
 * the page, keeps a declaration file of the action names and props up to
 * date, warns about unknown actions in index.html, and writes a manifest for
 * `cyclewire check`. It imports nothing from Vite.
 *
 *   import cyclewire from 'cyclewire/vite';
 *   export default { plugins: [cyclewire({ actions: 'src/actions', devtools: true })] };
 *
 *   import actions from 'virtual:cyclewire/actions';
 *   start({ actions });
 */
import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { scanActions } from './actions.js';
import { checkTemplate } from './check.js';
import { ACTION_DIRS } from './config.js';
import { MANIFEST_VERSION, registryOf } from './registry.js';
import { writeDeclarations } from './types.js';

const VIRTUAL = 'virtual:cyclewire/actions';
const RESOLVED = `\0${VIRTUAL}`;
const UPDATE = 'cyclewire:update';

/**
 * @typedef {object} Options
 * @property {string} [actions]            the actions directory, relative to Vite's root. Default: the first of src/actions, actions, …
 * @property {string | false} [types]      the declaration file to keep up to date, relative to the root, or false. Default: cyclewire-actions.d.ts next to the actions directory
 * @property {boolean} [devtools]          open cyclewire/devtools during development
 * @property {boolean} [check]             warn about unknown actions and invalid values in index.html. Default: true
 * @property {string} [prefix]             the attribute prefix, as passed to start(). Default: "cw-"
 * @property {string | false} [manifest]   where the build writes the manifest for `cyclewire check`, inside outDir, or false. Default: .vite/cyclewire.json
 */

const toSlash = (/** @type {string} */ path) => path.split(sep).join('/');
const exists = (/** @type {string} */ path) => stat(path).then(() => true, () => false);

/**
 * @param {Options} [options]
 * @returns {any} a Vite plugin
 */
export default function cyclewire(options = {}) {
    const { devtools = false, check = true, prefix = 'cw-' } = options;
    let root = process.cwd();
    let serving = false;
    /** @type {string} */
    let dir = '';
    /** @type {import('./actions.js').ActionModule[]} */
    let modules = [];
    /** @type {any} */
    let logger = console;

    /** The directory's modules, and the declarations that describe them. */
    const scan = async () => {
        ({ modules } = await scanActions(dir));
        if (options.types !== false) {
            const types = resolve(root, options.types ?? join(relative(root, dir), '..', 'cyclewire-actions.d.ts'));
            await writeDeclarations(modules, types, toSlash(relative(root, dir)));
        }
    };
    const inside = (/** @type {string} */ file) => {
        const path = relative(dir, file);
        return Boolean(path) && !path.startsWith('..') && !isAbsolute(path);
    };
    /** Root-relative URLs, which Vite resolves in development and in the build alike. */
    const url = (/** @type {string} */ file) => `/${toSlash(relative(root, file))}`;

    return {
        name: 'cyclewire',
        enforce: 'pre',

        /** @param {any} config */
        async configResolved(config) {
            root = config.root;
            serving = config.command === 'serve';
            logger = config.logger ?? console;
            if (options.actions) dir = resolve(root, options.actions);
            else {
                for (const candidate of ACTION_DIRS) {
                    if (await exists(join(root, candidate))) {
                        dir = join(root, candidate);
                        break;
                    }
                }
                dir ||= join(root, 'src/actions');
            }
        },

        async buildStart() {
            await scan();
        },

        /** @param {string} id */
        resolveId(id) {
            return id === VIRTUAL ? RESOLVED : undefined;
        },

        /** @param {string} id */
        load(id) {
            if (id !== RESOLVED) return undefined;
            const entries = modules.map((module) => `    ${JSON.stringify(module.name)}: () => import(${JSON.stringify(url(module.file))}),`);
            const lines = [`export default {\n${entries.join('\n')}\n};`];
            if (serving) {
                lines.unshift("import { register } from 'cyclewire';");
                // A changed action is registered again: its next run imports the new code, and the page stays.
                lines.push(`if (import.meta.hot) import.meta.hot.on(${JSON.stringify(UPDATE)}, ({ name, url }) => register({ [name]: () => import(/* @vite-ignore */ url) }));`);
                if (devtools) lines.push("import('cyclewire/devtools').then(({ install }) => install());");
            }
            return lines.join('\n');
        },

        /** @param {any} server */
        configureServer(server) {
            // A new or deleted action changes the registry itself: reload.
            const changed = async (/** @type {string} */ file) => {
                if (!inside(file)) return;
                await scan();
                const virtual = server.moduleGraph.getModuleById(RESOLVED);
                if (virtual) server.moduleGraph.invalidateModule(virtual);
                server.ws.send({ type: 'full-reload' });
            };
            server.watcher.on('add', changed);
            server.watcher.on('unlink', changed);
        },

        /** @param {{ file: string, server: any }} context */
        async handleHotUpdate({ file, server }) {
            if (!inside(file)) return undefined;
            const before = JSON.stringify(modules.map((module) => [module.name, module.exports]));
            await scan();
            const module = modules.find((item) => item.file === resolve(file));
            if (!module) return undefined;
            if (JSON.stringify(modules.map((item) => [item.name, item.exports])) !== before) {
                const virtual = server.moduleGraph.getModuleById(RESOLVED);
                if (virtual) server.moduleGraph.invalidateModule(virtual);
            }
            server.ws.send({ type: 'custom', event: UPDATE, data: { name: module.name, url: `${url(module.file)}?t=${Date.now()}` } });
            return [];
        },

        transformIndexHtml: {
            order: 'pre',
            /**
             * @param {string} html
             * @param {{ filename?: string }} context
             */
            handler(html, context) {
                if (check) {
                    const file = toSlash(relative(root, context.filename ?? join(root, 'index.html')));
                    const { problems } = checkTemplate(html, { file, registry: registryOf(modules, toSlash(relative(root, dir))), prefix });
                    for (const problem of problems) logger.warn(`[cyclewire] ${problem.file}:${problem.line}:${problem.column} ${problem.message}`);
                }
                if (!serving || !devtools) return html;
                return [{ tag: 'script', attrs: { type: 'module' }, children: "import('cyclewire/devtools').then(({ install }) => install());", injectTo: 'body' }];
            },
        },

        generateBundle() {
            if (options.manifest === false) return;
            const manifest = {
                version: MANIFEST_VERSION,
                actions: modules.map((module) => ({ name: module.name, file: toSlash(relative(root, module.file)), exports: module.exports, star: module.star })),
            };
            /** @type {any} */ (this).emitFile({ type: 'asset', fileName: options.manifest ?? '.vite/cyclewire.json', source: `${JSON.stringify(manifest, null, 2)}\n` });
        },
    };
}
