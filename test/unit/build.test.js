import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Runs on the files `npm run build` wrote.
const dir = new URL('../../dist/esm/', import.meta.url);

test('the production modules import nothing only for its side effects', async () => {
    for (const file of await readdir(dir)) {
        const code = await readFile(new URL(file, dir), 'utf8');
        assert.doesNotMatch(code, /^import\s*["']/m, `dist/esm/${file} has a bare import`);
    }
});
