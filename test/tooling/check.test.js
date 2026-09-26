import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { check } from '../../tooling/check.js';
import { main } from '../../tooling/cli.js';
import { loadConfig } from '../../tooling/config.js';

const app = fileURLToPath(new URL('./fixtures/app', import.meta.url));

/** Runs the command, capturing what it prints. */
async function run(args) {
    const out = [];
    const err = [];
    const { log, error } = console;
    console.log = (...parts) => out.push(parts.join(' '));
    console.error = (...parts) => err.push(parts.join(' '));
    try {
        const status = await main(args);
        return { status, out: out.join('\n'), err: err.join('\n') };
    } finally {
        Object.assign(console, { log, error });
    }
}

test('check reports unknown actions and exports with suggestions, and invalid values', async () => {
    const report = await check(await loadConfig({ root: app }));
    assert.deepEqual(report.problems.map(({ code, file, line }) => `${code} ${file}:${line}`), [
        'unknown-export views/page.html:3',
        'unknown-action views/page.html:4',
        'no-handler views/page.html:5',
        'invalid-trigger views/page.html:6',
        'invalid-debounce views/page.html:7',
        'invalid-props views/page.html:8',
        'invalid-name views/page.html:10',
    ]);
    const message = (code) => report.problems.find((problem) => problem.code === code).message;
    assert.equal(message('unknown-export'), '"cart" has no export "ad"; did you mean "cart#add"?');
    assert.equal(message('unknown-action'), '"crat#add" is not registered; did you mean "cart#add"?');
    assert.equal(message('no-handler'), '"cart" has no run or default export; name one, as in "cart#add".');
    // Three files; the Blade value built by the template is counted, not checked.
    assert.equal(report.files, 3);
    assert.equal(report.dynamic, 1);
    assert.equal(report.source, 'src/actions');
});

test('--unused lists the exports no template names', async () => {
    const report = await check(await loadConfig({ root: app }), { unused: true });
    assert.deepEqual(report.problems.filter((problem) => problem.severity === 'warning').map(({ message, file, line }) => `${message} ${file}:${line}`), [
        '"cart#helper" is not used by any template. src/actions/cart.js:3',
    ]);
});

test('the command exits 1 on errors, 2 on usage errors, and prints GitHub annotations', async () => {
    const text = await run(['check', '--root', app]);
    assert.equal(text.status, 1);
    assert.match(text.out, /^views\/page\.html:3:7  error  "cart" has no export "ad"; did you mean "cart#add"\?  \(unknown-export\)$/m);
    assert.match(text.out, /7 errors, 0 warnings in 3 templates: \d+ values checked against src\/actions, 1 value built by the templates not checked\.$/);

    const github = await run(['check', '--root', app, '--format', 'github']);
    assert.match(github.out, /^::error file=views\/page\.html,line=4,col=9,title=unknown-action::"crat#add" is not registered; did you mean "cart#add"\?$/m);

    const json = await run(['check', '--root', app, '--format', 'json']);
    assert.equal(JSON.parse(json.out).problems.length, 7);

    assert.equal((await run(['check', '--root', app, '--format', 'xml'])).status, 2);
    assert.equal((await run(['check', '--root', app, '--config', 'missing.json'])).status, 2);
    assert.equal((await run(['frobnicate'])).status, 2);
    assert.equal((await run(['--help'])).status, 0);
    // Only the templates that are right.
    assert.equal((await run(['check', '--root', app, '--templates', 'src/**/*.jsx'])).status, 0);
});

test('types writes the declarations next to the actions, or where --out says', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cyclewire-types-'));
    const out = join(dir, 'actions.d.ts');
    const result = await run(['types', '--root', app, '--out', out]);
    assert.equal(result.status, 0);
    assert.match(result.out, /^Wrote .*actions\.d\.ts, 4 action modules from src\/actions\.$/);
    const text = await readFile(out, 'utf8');
    assert.match(text, /^interface CycleWireActions \{$/m);
    assert.match(text, /"cart#add": typeof import\(".*\/fixtures\/app\/src\/actions\/cart\.js"\)\["add"\];/);
    assert.match(text, /"like": typeof import\(".*like\.js"\)\["run"\];/);
    assert.match(text, /"modal": typeof import\(".*modal\/index\.js"\)\["default"\];/);
    assert.match(text, /declare module 'virtual:cyclewire\/actions'/);
    assert.match((await run(['types', '--root', app, '--out', out])).out, /^Unchanged:/);
});
