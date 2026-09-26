#!/usr/bin/env node
/**
 * Which stacks a change needs checked, from the paths it touches (one per line
 * on stdin, relative to the repository). A change inside apps/<id>/ checks
 * that stack and the variants that build on it; anything else (the runner,
 * the scenario, the proxy, the library itself) can change every stack's
 * results, so it checks them all. Prints a comma-separated list, nothing for
 * every stack, or "none" when the change touches no stack's page.
 *
 *   gh api repos/OWNER/REPO/pulls/N/files --paginate --jq '.[].filename' | node scripts/changed.js
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APPS = fileURLToPath(new URL('../apps/', import.meta.url));

/**
 * @param {string[]} paths changed paths, relative to the repository
 * @param {Record<string, { of?: string }>} variants each stack's `variant`, if it has one
 * @returns {string[] | null} the stacks to check, or null for all
 */
export function changedStacks(paths, variants) {
    const ids = new Set();
    for (const path of paths.filter(Boolean)) {
        const match = /^bench\/apps\/([^/]+)\//.exec(path);
        // Documentation and results change no stack's page.
        if (!match) {
            if (/^bench\/(results\/|[^/]+\.md$)/.test(path) || /\.md$/.test(path)) continue;
            return null;
        }
        ids.add(match[1]);
    }
    // A variant builds on its stack's files, so a change there checks it too.
    for (const [id, variant] of Object.entries(variants)) if (variant?.of && ids.has(variant.of)) ids.add(id);
    return [...ids].filter((id) => id in variants).sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const paths = readFileSync(0, 'utf8').split('\n').map((line) => line.trim());
    const variants = Object.fromEntries(readdirSync(APPS).filter((id) => existsSync(join(APPS, id, 'bench.json'))).map((id) => [id, JSON.parse(readFileSync(join(APPS, id, 'bench.json'), 'utf8')).variant ?? null]));
    const stacks = changedStacks(paths, variants);
    process.stdout.write(stacks === null ? '' : stacks.join(',') || 'none');
}
