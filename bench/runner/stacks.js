/**
 * Stacks: the apps under apps/<id>/, each described by its bench.json. This
 * module installs and builds them, starts their servers on free ports, and
 * starts the proxy in front of them (proxy/main.js, in its own process).
 */
import { spawn, fork } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './input.js';
import { validateManifest } from './validate.js';

export const APPS = fileURLToPath(new URL('../apps/', import.meta.url));
const PROXY = fileURLToPath(new URL('../proxy/main.js', import.meta.url));

/** Every stack with a bench.json, controls first. */
export function available() {
    const ids = readdirSync(APPS, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(APPS, entry.name, 'bench.json'))).map((entry) => entry.name);
    const order = ['static', 'vanilla'];
    return ids.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length) || a.localeCompare(b));
}

/**
 * @typedef {object} Stack
 * @property {string} id
 * @property {string} dir
 * @property {object} manifest bench.json
 * @property {Record<string, string>} versions installed versions of manifest.packages
 * @property {string} [url] set once the proxy is up
 */

/** @returns {Stack} */
export function load(id) {
    const dir = join(APPS, id);
    const manifest = JSON.parse(readFileSync(join(dir, 'bench.json'), 'utf8'));
    const problems = validateManifest(manifest);
    if (problems.length) throw new Error(`apps/${id}/bench.json does not match schema/bench.v1.json:\n${problems.join('\n')}`);
    if (manifest.id !== id) throw new Error(`apps/${id}/bench.json says its id is "${manifest.id}"`);
    return { id, dir, manifest, versions: {} };
}

/** Runs a shell command in a stack's folder, failing with its output. */
function run(command, cwd, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { cwd, shell: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk; });
        child.stderr.on('data', (chunk) => { output += chunk; });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(`\`${command}\` failed in ${cwd} (exit ${code}):\n${output.slice(-4000)}`))));
    });
}

/**
 * Installs the stack's dependencies when node_modules is missing, and builds
 * it unless told not to.
 * @param {Stack} stack
 */
export async function prepare(stack, { build = true, log = console.log } = {}) {
    const pkg = JSON.parse(readFileSync(join(stack.dir, 'package.json'), 'utf8'));
    const hasDependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length > 0;
    if (hasDependencies && !existsSync(join(stack.dir, 'node_modules'))) {
        log(`${stack.id}: installing`);
        await run(existsSync(join(stack.dir, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund', stack.dir);
    }
    if (build && stack.manifest.build) {
        log(`${stack.id}: building`);
        await run(stack.manifest.build, stack.dir, { NODE_ENV: 'production' });
    }
    for (const name of stack.manifest.packages ?? []) {
        const file = join(stack.dir, 'node_modules', name, 'package.json');
        stack.versions[name] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
    }
}

export async function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
            server.close(() => resolve(port));
        });
    });
}

async function waitForHttp(port, child, timeoutMs = 90_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (child.exitCode !== null) throw new Error(`exited with code ${child.exitCode}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
            await response.arrayBuffer();
            if (response.status < 500) return;
        } catch {
            // Not listening yet.
        }
        await sleep(250);
    }
    throw new Error(`did not answer on port ${port} within ${timeoutMs / 1000}s`);
}

/**
 * Starts each stack's server and the proxy in front of them. Sets stack.url.
 * @param {Stack[]} stacks
 * @returns {Promise<{ stop: () => Promise<void> }>}
 */
export async function start(stacks, { log = console.log } = {}) {
    /** @type {import('node:child_process').ChildProcess[]} */
    const children = [];
    const stop = async () => {
        for (const child of children) {
            if (child.exitCode !== null || child.signalCode) continue;
            try {
                if (child.pid && process.platform !== 'win32' && child.spawnargs.length) process.kill(-child.pid, 'SIGTERM');
                else child.kill('SIGTERM');
            } catch {
                child.kill('SIGTERM');
            }
        }
        await sleep(200);
    };

    try {
        const routes = [];
        for (const stack of stacks) {
            const port = await freePort();
            const child = spawn(stack.manifest.start, {
                cwd: stack.dir,
                shell: true,
                detached: process.platform !== 'win32',
                env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let output = '';
            child.stdout?.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
            child.stderr?.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
            children.push(child);
            try {
                await waitForHttp(port, child);
            } catch (error) {
                throw new Error(`${stack.id}: its server (${stack.manifest.start}) ${error.message}\n${output}`);
            }
            routes.push({ id: stack.id, upstream: port, listen: await freePort() });
        }

        const proxy = fork(PROXY, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        children.push(proxy);
        const ready = new Promise((resolve, reject) => {
            proxy.once('message', resolve);
            proxy.once('exit', (code) => reject(new Error(`The proxy exited with code ${code}`)));
        });
        proxy.send({ stacks: routes });
        await ready;
        for (const stack of stacks) stack.url = `https://localhost:${routes.find((route) => route.id === stack.id).listen}/`;
        log(`Serving ${stacks.map((stack) => `${stack.id} at ${stack.url}`).join(', ')}`);
        return { stop };
    } catch (error) {
        await stop();
        throw error;
    }
}
