/**
 * Copies a template into a new project. No dependencies: `npm create
 * cyclewire` should start in a second.
 */
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES = {
    vite: 'Vite, with cyclewire/vite and the devtools',
    vanilla: 'No build step: an import map, and CycleWire from a CDN',
    astro: 'Astro pages with CycleWire actions',
    laravel: 'CycleWire for an existing Laravel app',
};

const HERE = fileURLToPath(new URL('.', import.meta.url));
const exists = (/** @type {string} */ path) => stat(path).then(() => true, () => false);

/** A package name npm accepts, from a directory name. */
export function packageName(dir) {
    const name = basename(resolve(dir)).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[._-]+|-+$/g, '');
    return name || 'cyclewire-app';
}

/** Every file under `dir`, relative to it, with forward slashes. */
async function files(dir, root = dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...await files(path, root));
        else found.push(relative(root, path).split('\\').join('/'));
    }
    return found.sort();
}

/**
 * npm leaves `.gitignore` files out of packages, so templates name them
 * `_gitignore`.
 * @param {string} path
 */
const target = (path) => path.replace(/(^|\/)_gitignore$/, '$1.gitignore');

/**
 * Copies `template` into `dir`.
 * @param {object} options
 * @param {string} options.dir
 * @param {keyof typeof TEMPLATES} options.template
 * @param {boolean} [options.merge] add files to an existing project, leaving the ones it has (laravel)
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function create({ dir, template, merge = false }) {
    if (!Object.hasOwn(TEMPLATES, template)) throw new Error(`There is no "${template}" template. Choose one of: ${Object.keys(TEMPLATES).join(', ')}.`);
    const source = join(HERE, 'templates', template);
    const destination = resolve(dir);
    if (!merge && (await exists(destination)) && (await readdir(destination)).length) {
        throw new Error(`${dir} is not empty. Choose a new directory${template === 'laravel' ? '' : ', or an empty one'}.`);
    }
    const name = packageName(dir);
    const written = [];
    const skipped = [];
    for (const path of await files(source)) {
        const out = join(destination, target(path));
        if (merge && (await exists(out))) {
            skipped.push(target(path));
            continue;
        }
        await mkdir(join(out, '..'), { recursive: true });
        if (path === 'package.json') {
            // Templates carry a valid name, so they also open as they are (on StackBlitz, say).
            const pkg = JSON.parse(await readFile(join(source, path), 'utf8'));
            await writeFile(out, `${JSON.stringify({ ...pkg, name }, null, 2)}\n`);
        } else if (/\.md$/.test(path)) {
            await writeFile(out, (await readFile(join(source, path), 'utf8')).replaceAll('__PROJECT_NAME__', name));
        } else {
            await copyFile(join(source, path), out);
        }
        written.push(target(path));
    }
    return { written, skipped };
}
