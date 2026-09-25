import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newerSyntax } from '../../scripts/check-es.js';

test('ES2020 syntax passes and newer syntax is caught', () => {
    assert.equal(newerSyntax('const a = b ?? c?.d; export { a };', 'module'), null);
    assert.equal(newerSyntax('var x = 1n + BigInt(2);', 'script'), null);
    for (const newer of ['a ??= b;', 'a ||= b;', 'const n = 1_000;', 'class A { #x = 1; }', 'class A { static { } }', 'await x;']) {
        assert.notEqual(newerSyntax(newer, newer.startsWith('await') ? 'script' : 'module'), null, newer);
    }
});

test('reports where the newer syntax is', () => {
    const error = newerSyntax('let a;\na ??= 1;', 'module');
    assert.equal(error?.line, 2);
});
