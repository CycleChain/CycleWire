#!/usr/bin/env node
/**
 * Holds every shipped file to the ES2020 syntax the README promises: each
 * .js file in dist/ must parse as ES2020 (classic scripts for the
 * *.global.min.js builds, modules for everything else). tsconfig.json's
 * "lib" setting does the same for built-in APIs at type-check time.
 *
 *   npm run build && npm run check:es
 */
import { parse } from 'acorn';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The first syntax error when `source` is read as ES2020, or null.
 * @param {string} source
 * @param {'script' | 'module'} sourceType
 * @returns {{ message: string, line: number, column: number } | null}
 */
export function newerSyntax(source, sourceType) {
    try {
        parse(source, { ecmaVersion: 2020, sourceType });
        return null;
    } catch (error) {
        const { message, loc } = /** @type {any} */ (error);
        return { message, line: loc?.line ?? 0, column: loc?.column ?? 0 };
    }
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* files(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* files(path);
        else if (entry.name.endsWith('.js')) yield path;
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    let checked = 0;
    let failed = 0;
    for await (const file of files(dist)) {
        checked++;
        const error = newerSyntax(await readFile(file, 'utf8'), file.endsWith('.global.min.js') ? 'script' : 'module');
        if (error) {
            failed++;
            console.error(`${relative(process.cwd(), file)}:${error.line}:${error.column}  not ES2020: ${error.message}`);
        }
    }
    if (!checked) {
        console.error('dist/ has no .js files: run `npm run build` first.');
        process.exit(1);
    }
    console.log(`${checked} files checked, ${failed ? `${failed} newer than ES2020` : 'all ES2020'}.`);
    if (failed) process.exit(1);
}
