import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportsOf } from '../../tooling/exports.js';

const names = (source) => exportsOf(source).exports.map((item) => item.name);

test('declarations, defaults and export lists', () => {
    assert.deepEqual(names(`
        export function run() {}
        export async function add({ props }) { return props; }
        export function* steps() {}
        export class Widget {}
        export const a = 1, b = { x: [1, 2] }, c = () => { const d = 1; };
        export let e;
        export var f = (g, h) => g + h;
        export default function () {}
        const local = 1, other = 2;
        export { local, other as renamed, local as 'quoted-name' };
        export { thing as default2 } from './thing.js';
        export * as tools from './tools.js';
    `), ['run', 'add', 'steps', 'Widget', 'a', 'b', 'c', 'e', 'f', 'default', 'local', 'renamed', 'quoted-name', 'default2', 'tools']);
});

test('destructuring binds its names, not its keys or defaults', () => {
    assert.deepEqual(names('export const { a, b: c, d = e, ...f } = obj, [g, , h] = list;'), ['a', 'c', 'd', 'f', 'g', 'h']);
});

test('comments, strings, template literals and regular expressions hide what looks like exports', () => {
    assert.deepEqual(names(`
        // export function commented() {}
        /* export const blocked = 1; */
        const text = 'export function quoted() {}';
        const html = \`export const templated = \${ { nested: \`export const deeper = 1\` } }\`;
        const pattern = /export function inRegex\\//g;
        const divided = 4 / 2; export const after = divided / 1;
        function inner() { const x = { export: 1 }; return x.export; }
        export const real = true;
    `), ['after', 'real']);
});

test('TypeScript: generics and annotations are skipped, type-only exports ignored', () => {
    assert.deepEqual(names(`
        import type { Context } from 'cyclewire';
        export type Props = { sku: string };
        export interface Shape { id: number }
        export type { Other } from './other.js';
        export declare const ambient: number;
        export const enum Kind { A }
        export enum Mode { On, Off }
        export const add = defineAction<{ sku: string; tags: Array<string> }, HTMLFormElement>(({ props }) => props.sku);
        export async function remove({ props }: Context<{ id: string }>): Promise<void> {}
        export { type Hidden, shown };
        export abstract class Base {}
    `), ['Mode', 'add', 'remove', 'shown', 'Base']);
});

test('export * from another module is reported, not guessed', () => {
    assert.deepEqual(exportsOf("export * from './shared.js'; export const own = 1;"), { exports: [{ name: 'own', line: 1 }], star: true });
});

test('lines point at the export', () => {
    assert.deepEqual(exportsOf('\n\nexport function run() {}\n\nexport { a };\n').exports, [{ name: 'run', line: 3 }, { name: 'a', line: 5 }]);
});
