// The CycleWire app (../cyclewire/server.js) with the core inlined, as the
// performance guide suggests for the fastest activation: <head> holds a JSON
// block that maps each action to its module's URL, then the classic-script
// build itself, which starts CycleWire while the page is still parsing. Add
// to cart's module is preloaded with the page, as in the app; the prefetch
// plugin follows as a module.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../cyclewire/page.js';

const meta = JSON.parse(readFileSync(new URL('dist/meta.json', import.meta.url), 'utf8'));
/** The URL of the module built from a source file, by its name: cart.js → /js/cart-HASH.js. */
const built = Object.fromEntries(Object.entries(meta.outputs).filter(([, output]) => output.entryPoint).map(([file, output]) => [basename(output.entryPoint, '.js'), `/js/${basename(file)}`]));
const { plugins, ...actions } = built;
// The build, without its source map comment: the page is not the build's file.
const core = readFileSync(fileURLToPath(import.meta.resolve('cyclewire/dist/cyclewire.global.min.js')), 'utf8').replace(/\n\/\/# sourceMappingURL=.*\s*$/, '');
if (/<\/script/i.test(core)) throw new Error('The classic-script build cannot be inlined as it is.');
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

serve({
    js: fileURLToPath(new URL('dist/js/', import.meta.url)),
    head: [
        `<script type="application/json" data-cyclewire>${json({ actions })}</script>`,
        `<script>${core}</script>`,
        `<link rel="modulepreload" href="${actions.cart}">`,
        `<script type="module" src="${plugins}"></script>`,
    ].join('\n'),
});
