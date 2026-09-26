import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, createLogger, createServer } from 'vite';
import cyclewire from '../../tooling/vite.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));

/** A copy of the fixture app, and a Vite configuration that uses the plugin and this checkout's sources. */
async function setup(options = {}) {
    const root = await mkdtemp(join(tmpdir(), 'cyclewire-vite-'));
    await cp(fileURLToPath(new URL('./fixtures/vite-app', import.meta.url)), root, { recursive: true });
    const warnings = [];
    const logger = createLogger('silent');
    logger.warn = (message) => warnings.push(message);
    const config = {
        root,
        configFile: false,
        customLogger: logger,
        resolve: { alias: [{ find: /^cyclewire$/, replacement: join(repo, 'src/index.js') }] },
        define: { __DEV__: 'true', __VERSION__: '"test"' },
        plugins: [cyclewire({ types: 'types/cyclewire-actions.d.ts', ...options })],
    };
    return { root, config, warnings };
}

test('a build gives every action its own chunk, and writes the types and the manifest', async () => {
    const { root, config, warnings } = await setup();
    const out = join(root, 'dist');
    await build({ ...config, build: { outDir: out, emptyOutDir: true, minify: false } });

    const manifest = JSON.parse(await readFile(join(out, '.vite/cyclewire.json'), 'utf8'));
    assert.deepEqual(manifest, {
        version: 1,
        actions: [
            { name: 'cart', file: 'src/actions/cart.js', exports: ['add'], star: false },
            { name: 'like', file: 'src/actions/like.js', exports: ['run'], star: false },
        ],
    });
    const chunks = (await readdir(join(out, 'assets'))).filter((file) => file.endsWith('.js'));
    const code = await Promise.all(chunks.map((file) => readFile(join(out, 'assets', file), 'utf8')));
    assert.equal(code.filter((text) => text.includes('like v1')).length, 1);
    assert.equal(code.filter((text) => /["']added["']/.test(text)).length, 1);
    assert.ok(!code.some((text) => text.includes('like v1') && /["']added["']/.test(text)), 'the actions share a chunk');
    // No development-only code in the build.
    assert.ok(!code.some((text) => text.includes('cyclewire:update')));

    assert.match(await readFile(join(root, 'types/cyclewire-actions.d.ts'), 'utf8'), /"cart#add": typeof import\("\.\.\/src\/actions\/cart\.js"\)\["add"\];/);
    assert.deepEqual(warnings.filter((message) => message.includes('[cyclewire]')), ['[cyclewire] index.html:10:23 "lik" is not registered; did you mean "like"?']);
});

test('in development, a changed action is registered again instead of reloading the page', async () => {
    const { root, config } = await setup();
    const server = await createServer({ ...config, server: { port: 0, strictPort: false } });
    await server.listen();
    try {
        const virtual = await server.transformRequest('virtual:cyclewire/actions');
        assert.match(virtual.code, /"like": \(\) => import\("\/src\/actions\/like\.js"\)/);
        assert.match(virtual.code, /cyclewire:update/);

        const sent = [];
        const send = server.ws.send.bind(server.ws);
        server.ws.send = (payload, ...rest) => {
            sent.push(payload);
            return send(payload, ...rest);
        };
        // Vite only sends updates for modules a page has loaded.
        await server.transformRequest('/src/actions/like.js');
        await writeFile(join(root, 'src/actions/like.js'), "export function run() {\n    document.getElementById('out').textContent = 'like v2';\n}\n");
        const deadline = Date.now() + 5000;
        while (!sent.some((payload) => payload?.event === 'cyclewire:update') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
        const update = sent.find((payload) => payload?.event === 'cyclewire:update');
        assert.ok(update, `no update was sent: ${JSON.stringify(sent)}`);
        assert.equal(update.data.name, 'like');
        assert.match(update.data.url, /^\/src\/actions\/like\.js\?t=\d+$/);
        assert.ok(!sent.some((payload) => payload?.type === 'full-reload'), 'the page was reloaded');
    } finally {
        await server.close();
    }
});

test('early: true puts the early script first in <head>, after <meta charset>, with the prefix start() uses', async () => {
    const { root, config } = await setup({ early: true, prefix: 'data-cw-' });
    const out = join(root, 'dist');
    await build({ ...config, build: { outDir: out, emptyOutDir: true, minify: false } });
    const page = await readFile(join(out, 'index.html'), 'utf8');
    const charset = '<meta charset="utf-8">';
    const script = page.slice(page.indexOf(charset) + charset.length);
    assert.match(script, /^<script>\(function \w+\(\w+\)/);
    assert.match(script.slice(0, script.indexOf('</script>')), /\("data-cw-"\)$/);
});
