#!/usr/bin/env node
/**
 * Creates a project from each template, installs it with this checkout's
 * CycleWire (packed, as npm would ship it), builds and serves it, and uses
 * it in Chromium: the like button and the filter must work. CI runs it after
 * `npm run build`; locally, pass the templates to try:
 *
 *   node packages/create-cyclewire/test/smoke.js vanilla vite
 *
 * The laravel template needs a Laravel app and PHP; the unit tests check its
 * files and markup.
 */
import { chromium, expect } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { create } from '../create.js';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const run = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const templates = process.argv.slice(2).length ? process.argv.slice(2) : ['vanilla', 'vite', 'astro'];

const freePort = () => new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
        const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
        server.close(() => resolve(port));
    });
});

/**
 * Starts a server and resolves once it answers. It gets a process group of
 * its own, so stop() ends whatever the server starts too.
 */
async function serve(command, args, cwd, port) {
    const child = spawn(command, args, { cwd, env: { ...process.env, PORT: String(port) }, stdio: 'pipe', shell: process.platform === 'win32', detached: process.platform !== 'win32' });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child;
        } catch {
            // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await stop(child, port);
    throw new Error(`The server did not start:\n${output}`);
}

/**
 * Ends a server started by serve(), with everything it started: politely,
 * then for good if it is still there after two seconds. Astro's preview
 * server starts itself again in a process group of its own, so whatever
 * still listens on the port is ended too (with lsof, where there is one).
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} port
 */
async function stop(child, port) {
    /** @param {NodeJS.Signals} signal */
    const send = (signal) => {
        try {
            if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
            else child.kill(signal);
        } catch {
            // Already gone.
        }
    };
    if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
        send('SIGTERM');
        if (!(await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000, false))]))) send('SIGKILL');
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    if (process.platform === 'win32') return;
    try {
        const { stdout } = await run('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
        for (const pid of stdout.split('\n').filter(Boolean)) process.kill(Number(pid), 'SIGKILL');
    } catch {
        // No lsof, or nothing listens any more.
    }
}

const work = await mkdtemp(join(tmpdir(), 'cyclewire-smoke-'));
const { stdout } = await run(npm, ['pack', '--pack-destination', work], { cwd: REPO, shell: process.platform === 'win32' });
const tarball = join(work, stdout.trim().split('\n').at(-1));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
let failed = false;

for (const template of templates) {
    const dir = join(work, template);
    const started = Date.now();
    await create({ dir, template });
    const port = await freePort();
    /** @type {import('node:child_process').ChildProcess | undefined} */
    let server;
    try {
        if (template === 'vanilla') {
            // This checkout's bundles instead of the CDN's.
            await mkdir(join(dir, 'cyclewire'));
            for (const file of await readdir(join(REPO, 'dist'))) if (file.endsWith('.min.js')) await cp(join(REPO, 'dist', file), join(dir, 'cyclewire', file));
            const page = join(dir, 'index.html');
            await writeFile(page, (await readFile(page, 'utf8')).replaceAll('https://cdn.jsdelivr.net/npm/cyclewire@1/dist/', './cyclewire/'));
            server = await serve(process.execPath, ['serve.js'], dir, port);
        } else {
            const manifest = join(dir, 'package.json');
            const pkg = JSON.parse(await readFile(manifest, 'utf8'));
            pkg.dependencies.cyclewire = `file:${tarball}`;
            await writeFile(manifest, JSON.stringify(pkg, null, 2));
            await run(npm, ['install', '--no-audit', '--no-fund'], { cwd: dir, shell: process.platform === 'win32' });
            await run(npm, ['run', 'build'], { cwd: dir, shell: process.platform === 'win32' });
            // The preview script's own binary, not `npm run preview`: npm starts a
            // script in a process group of its own, which stop() would not reach.
            const [bin, ...rest] = pkg.scripts.preview.split(' ');
            const args = [...rest, '--port', String(port), '--host', '127.0.0.1'];
            server = process.platform === 'win32'
                ? await serve(npm, ['run', 'preview', '--', ...args.slice(rest.length)], dir, port)
                : await serve(join(dir, 'node_modules', '.bin', bin), args, dir, port);
        }
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/`);
        const like = page.locator('.like');
        await like.click();
        await expect(like).toHaveAttribute('aria-pressed', 'true');
        await expect(like.locator('.like__count')).toHaveText('13');
        await page.fill('#search', 'la');
        await expect(page.locator('#tools-count')).toHaveText('1 of 5');
        if (errors.length) throw new Error(errors.join('\n'));
        await page.close();
        console.log(`ok  ${template} (${Math.round((Date.now() - started) / 1000)} s)`);
    } catch (error) {
        failed = true;
        console.error(`FAIL ${template}: ${/** @type {Error} */ (error).message}`);
    } finally {
        if (server) await stop(server, port);
    }
}

await browser.close();
await rm(work, { recursive: true, force: true }).catch(() => {});
// A server that outlives its group would keep this process open until CI's timeout.
process.exit(failed ? 1 : 0);
