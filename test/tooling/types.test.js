import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { main } from '../../tooling/cli.js';
import { specifier } from '../../tooling/types.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));

test('specifiers import TypeScript sources by the extension they compile to', () => {
    assert.equal(specifier('/app/src/actions/cart.ts', '/app/src'), './actions/cart.js');
    assert.equal(specifier('/app/src/actions/panel.tsx', '/app'), './src/actions/panel.jsx');
    assert.equal(specifier('/app/actions/x.mts', '/app/types'), '../actions/x.mjs');
    assert.equal(specifier('/app/actions/y.js', '/app/actions'), './y.js');
});

test('the generated declarations type the names and props an app uses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cyclewire-typed-'));
    await cp(fileURLToPath(new URL('./fixtures/typed', import.meta.url)), dir, { recursive: true });
    const { log } = console;
    console.log = () => {};
    try {
        assert.equal(await main(['types', '--root', dir, '--actions', 'src/actions']), 0);
    } finally {
        console.log = log;
    }
    assert.match(await readFile(join(dir, 'src/cyclewire-actions.d.ts'), 'utf8'), /"cart#add": typeof import\("\.\/actions\/cart\.js"\)\["add"\];/);
    await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], types: [],
            strict: true, noEmit: true, allowJs: true, skipLibCheck: true,
            paths: { cyclewire: [join(repo, 'src/index.js')] },
        },
        include: ['src'],
    }));
    const tsc = join(repo, 'node_modules/typescript/bin/tsc');
    const result = await promisify(execFile)(process.execPath, [tsc, '-p', join(dir, 'tsconfig.json')]).catch((error) => error);
    assert.equal(result.code ?? 0, 0, `${result.stdout ?? ''}${result.stderr ?? ''}`);
});
