import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { create, packageName, TEMPLATES } from '../create.js';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../index.js', import.meta.url));
const check = fileURLToPath(new URL('../../../tooling/bin.js', import.meta.url));
const exists = (path) => stat(path).then(() => true, () => false);
const scratch = () => mkdtemp(join(tmpdir(), 'create-cyclewire-'));

test('package names come from the directory', () => {
    assert.equal(packageName('/tmp/My App!'), 'my-app');
    assert.equal(packageName('./.hidden'), 'hidden');
    assert.equal(packageName('/'), 'cyclewire-app');
});

for (const template of Object.keys(TEMPLATES)) {
    test(`the ${template} template is complete, named and passes cyclewire check`, async () => {
        const dir = join(await scratch(), 'shop-front');
        const { written } = await create({ dir, template });
        assert.ok(written.length > 2);
        assert.ok(!written.some((path) => path.includes('_gitignore')));
        if (template !== 'laravel') {
            assert.ok(await exists(join(dir, '.gitignore')));
            assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).name, 'shop-front');
        }
        const args = {
            vite: [],
            vanilla: [],
            astro: ['--templates', 'src/**/*.astro'],
            laravel: ['--actions', 'resources/js/actions', '--templates', 'resources/views/**/*.blade.php'],
        }[template];
        const { stdout } = await run(process.execPath, [check, 'check', '--root', dir, ...args]);
        assert.match(stdout, /^0 errors, 0 warnings in \d+ templates?: [1-9]\d* values? checked/m);
    });
}

test('it refuses a directory that is not empty, but the laravel template adds to one', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'existing.txt'), 'x');
    await assert.rejects(create({ dir, template: 'vite' }), /is not empty/);

    await mkdir(join(dir, 'resources/js/actions'), { recursive: true });
    await writeFile(join(dir, 'resources/js/actions/like.js'), '// mine\n');
    const { written, skipped } = await create({ dir, template: 'laravel', merge: true });
    assert.deepEqual(skipped, ['resources/js/actions/like.js']);
    assert.ok(written.includes('CYCLEWIRE.md'));
    assert.equal(await readFile(join(dir, 'resources/js/actions/like.js'), 'utf8'), '// mine\n');
});

test('the command creates a project, and asks for a template it does not know', async () => {
    const root = await scratch();
    const { stdout } = await run(process.execPath, [cli, join(root, 'app'), '--template', 'vanilla'], { cwd: root });
    assert.match(stdout, /Created a CycleWire vanilla project/);
    assert.match(stdout, /npm start/);
    await assert.rejects(run(process.execPath, [cli, join(root, 'other'), '--template', 'nope']), (error) => error.code === 1 && /no "nope" template/.test(error.stderr));
    // Without a terminal to ask in, a missing template is a usage error.
    await assert.rejects(run(process.execPath, [cli, join(root, 'third')]), (error) => error.code === 2);
});
