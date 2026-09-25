# Examples

Runnable examples, built the way an app would be: every action, and every library or
framework it imports, is a chunk the page downloads when it is first needed. They are
also live on GitHub Pages: https://cyclechain.github.io/CycleWire/examples/

| Example | What it shows |
| --- | --- |
| [react](react/) | A React component rendered on the server and hydrated by CycleWire when it scrolls into view, with a CycleWire action inside it |
| [vue](vue/) | The same with Vue |
| [svelte](svelte/) | The same with Svelte 5 |
| [libraries](libraries/) | Flatpickr, SweetAlert2, DataTables and jQuery on a server-rendered page |
| [shared](shared/) | What the examples share: an action, the `removed()` helper, a stand-in server and the CSS |

The guides explain the patterns: [frameworks](../docs/frameworks.md) and
[libraries](../docs/libraries.md).

## Run them

```bash
npm install
npm run build      # CycleWire itself; the examples import it from dist/
npm run examples   # builds every example into examples/dist/
npm run dev        # serves them
```

Then open http://127.0.0.1:4173/examples/. `npm run examples -- --production` builds the
minified production bundles that the live demos use.

## How they are built

[`build.js`](build.js) bundles each example's `main.js` with esbuild and code splitting,
the output Vite or webpack would produce. It compiles Vue single-file components and
Svelte components with their official compilers. An example with a `server.js`
(`server.jsx` for React) is rendered on the server at build time; in a real app your
server renders it per request. `examples/dist/` has the same layout as the live demos.

The examples talk to a stand-in server, [`shared/server.js`](shared/server.js), that
answers after a short delay, so they also run on a static host. Swap in `fetch()` to
talk to a real one.

The frameworks and libraries are development dependencies of this repository, used only
by the examples and their tests. The `cyclewire` package itself has no dependencies.

## Tests

`npm run test:e2e` builds the examples first, then runs
[`examples.spec.js`](../test/e2e/examples.spec.js),
[`frameworks.spec.js`](../test/e2e/frameworks.spec.js) and
[`libraries.spec.js`](../test/e2e/libraries.spec.js) against them in Chromium, Firefox
and WebKit. `EXAMPLES=production npm run test:e2e` tests the production builds instead.
