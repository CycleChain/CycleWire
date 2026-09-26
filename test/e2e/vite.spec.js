import { expect, test } from '@playwright/test';
import { cp, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import cyclewire from '../../tooling/vite.js';

// cyclewire/vite in a real dev server: an edited action runs its new code
// on the next click, and the page is not reloaded.
const repo = fileURLToPath(new URL('../..', import.meta.url));

test('an edited action runs its new code without reloading the page', async ({ page }) => {
    // The real path: Vite serves files by it, and macOS's temporary directory is a link.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'cyclewire-hmr-')));
    await cp(join(repo, 'test/tooling/fixtures/vite-app'), root, { recursive: true });
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        resolve: { alias: [{ find: /^cyclewire$/, replacement: join(repo, 'src/index.js') }] },
        define: { __DEV__: 'true', __VERSION__: '"test"' },
        server: { port: 0, host: '127.0.0.1', fs: { allow: [root, repo] } },
        plugins: [cyclewire({ types: false })],
    });
    await server.listen();
    try {
        await page.goto(server.resolvedUrls.local[0]);
        await page.waitForFunction(() => window.__started === true);
        await page.evaluate(() => {
            window.__sameDocument = true;
        });
        await page.click('#like');
        await expect(page.locator('#out')).toHaveText('like v1');

        await writeFile(join(root, 'src/actions/like.js'), "export function run() {\n    document.getElementById('out').textContent = 'like v2';\n}\n");
        await expect.poll(async () => {
            await page.click('#like');
            return page.locator('#out').textContent();
        }, { timeout: 10_000 }).toBe('like v2');
        expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    } finally {
        await server.close();
        await rm(root, { recursive: true, force: true });
    }
});
