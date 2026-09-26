/**
 * What the micro results record about the machine and the libraries.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { environment } from '../runner/environment.js';

const MODULES = fileURLToPath(new URL('node_modules/', import.meta.url));

/**
 * The harness's CPU speed index loop (runner/environment.js), run in Node:
 * how many times a fixed string-building loop runs per second, the median
 * of three. Higher is faster.
 */
export function nodeCpuIndex() {
    const runs = [];
    for (let i = 0; i < 3; i++) {
        const start = performance.now();
        let iterations = 0;
        while (performance.now() - start < 500) {
            let text = '';
            for (let j = 0; j < 10000; j++) text += 'a';
            if (text.length !== 10000) throw new Error('unreachable');
            iterations++;
        }
        runs.push(Math.round(iterations / ((performance.now() - start) / 1000)));
    }
    return runs.sort((a, b) => a - b)[1];
}

/**
 * The machine, recorded the way the harness records it. The harness also
 * names the one browser it measures with; the micro benchmarks record each
 * browser on its own, so that field is left out.
 */
export function machine() {
    const { browser: _unused, ...rest } = environment(/** @type {any} */ ({ version: () => '' }));
    return { ...rest, nodeCpuIndex: nodeCpuIndex() };
}

/** The short commit the checkout is at, for the library built from source. */
function shortCommit() {
    try {
        return execFileSync('git', ['rev-parse', '--short', process.env.GITHUB_SHA || 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return 'source';
    }
}

/**
 * The installed version of a package. CycleWire is linked from this
 * repository (file:../..), so its version is the source at this commit, as
 * in 1.1.0-beta.1+89761f1.
 * @param {string} name
 */
export function installedVersion(name) {
    const dir = `${MODULES}${name}`;
    const file = `${dir}/package.json`;
    if (!existsSync(file)) return null;
    const { version } = JSON.parse(readFileSync(file, 'utf8'));
    return lstatSync(dir).isSymbolicLink() ? `${version}+${shortCommit()}` : version;
}
