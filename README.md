# CycleWire

[![npm](https://img.shields.io/npm/v/cyclewire.svg?style=flat-square)](https://www.npmjs.com/package/cyclewire)
[![CI](https://img.shields.io/github/actions/workflow/status/CycleChain/CycleWire/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/CycleChain/CycleWire/actions/workflows/ci.yml)
[![Core size](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcyclechain.github.io%2FCycleWire%2Fdist%2Fsizes.json&query=%24.files%5B%27cyclewire.min.js%27%5D.label&label=core&suffix=%20brotli&color=5b5bd6&style=flat-square)](#-size)
[![Dependencies](https://img.shields.io/badge/dependencies-0-2ea44f?style=flat-square)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square)](LICENSE)

> **Zero-initial-JS selective activation engine.** Turn server-rendered HTML into instant
> interactivity on intent.

CycleWire takes the architecture behind [Qwik](https://qwik.dev)'s loader and makes it
usable with **any** backend or frontend. Your server renders complete HTML. CycleWire
adds one small listener per event type and imports the code behind a button only when
someone reaches for it. It can also load that code when the element scrolls into view or
when the browser is idle. Nothing is hydrated and nothing is re-rendered on boot, and
there are no runtime dependencies.

- 🌐 **Landing page and live demos:** https://cyclechain.github.io/CycleWire/
- 🧪 **Live examples (React, Vue, Svelte, popular libraries):** https://cyclechain.github.io/CycleWire/examples/
- 📚 **Documentation:** [docs/](docs/README.md)
- 🚢 **Releases:** https://github.com/CycleChain/CycleWire/releases

---

## ✨ Why CycleWire

- **Nothing to hydrate.** The HTML your server sends is the UI. The 4.9 kB core
  (brotli) activates it; action code is fetched per feature, on demand.
- **Intent-aware loading.** Modules start downloading on hover, focus or touch, before
  the click lands. `modulepreload` fetches them without running them, and Save-Data and
  2G connections are respected.
- **Predictable under pressure.** Every binding has a concurrency mode (`drop`,
  `restart`, `latest`, `parallel`), an `AbortSignal`, `once` and `debounce`. Double
  submits and stale search results do not happen by accident.
- **Good for INP.** Handlers run after the browser has painted the pressed state.
  Nothing heavy runs on load, and the page stays bfcache friendly.
- **Works with anything.** Laravel, Rails, Django, plain PHP, Astro, Web Components,
  React/Vue/Svelte islands, htmx or Turbo. The attributes are short (`cw-action`) and
  pass through JSX and every template language; their prefix is an option.
- **Modern platform features where they exist:**
  - Shadow DOM and declarative shadow DOM
  - Invoker Commands
  - View Transitions
  - `moveBefore()`
  - `scheduler.yield()`
  - Trusted Types
  - Speculation-rules prerendering
- **Optional batteries, pay for what you import:**
  - [`css`](docs/css.md#stylesheets-that-belong-to-an-action): stylesheets that arrive with the actions that need them
  - [`dom`](docs/dom.md): safe `html` templates, inert fragments, swaps
  - [`morph`](docs/morph.md): DOM morphing that keeps state, instead of a virtual DOM
  - [`signals`](docs/signals.md): reactivity that resumes from server-rendered state
  - [`bootstrap`](docs/plugins.md): Bootstrap's data API without its JavaScript

---

## 🚀 Quick start

**1. Mark up what should be interactive.** Your server renders this; it works and reads
fine before any JavaScript arrives.

```html
<button cw-action="cart#add" cw-props='{"sku": "wire-01"}'>Add to cart</button>
```

**2. Write the action.** It is a plain ES module that is fetched on first use.

```js
// actions/cart.js
export async function add({ element, props, signal }) {
    const response = await fetch('/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(props),
        signal,
    });
    element.textContent = response.ok ? 'Added ✓' : 'Try again';
}
```

**3. Register it and start**, with a bundler:

```js
import { start } from 'cyclewire';

start({
    actions: {
        cart: () => import('./actions/cart.js'),
    },
});
```

…or with no build step at all:

```html
<script type="application/json" data-cyclewire>
    { "actions": { "cart": "/js/actions/cart.js" } }
</script>
<script src="https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.global.min.js" defer></script>
```

That's it. Until someone reaches for the button, the page has downloaded a single 5 kB
script and no action code.

---

## 📦 Installation

```bash
npm install cyclewire
```

```bash
pnpm add cyclewire
```

```bash
yarn add cyclewire
```

```bash
bun add cyclewire
```

| Entry | Import | For |
| --- | --- | --- |
| Core | `cyclewire` | Delegation, registry, triggers, preloading, concurrency, lifecycle events |
| Auto start | `cyclewire/auto` | Reads `<script type="application/json" data-cyclewire>`, starts, sets `window.CycleWire` |
| DOM | `cyclewire/dom` | `html`, `fragment`, `swap`, `transition` |
| Morph | `cyclewire/morph` | `morph` |
| Signals | `cyclewire/signals` | `signal`, `computed`, `effect`, `store`, `stateOf`, `signals()` plugin |
| Bootstrap | `cyclewire/bootstrap` | Bootstrap 5 data API plugin |

Bundlers that honour the `development` export condition (Vite, webpack, Rollup) get a
build with helpful warnings in development and the lean one in production.

**From a CDN.** jsDelivr, unpkg and esm.sh serve every published version:

```html
<!-- Classic script: core, starts itself, window.CycleWire -->
<script src="https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.global.min.js" defer></script>

<!-- Classic script with every module (dom, morph, signals, bootstrap) -->
<script src="https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.full.global.min.js" defer></script>

<!-- ES modules -->
<script type="module">
    import { start } from 'https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.min.js';
    import { html, swap } from 'https://cdn.jsdelivr.net/npm/cyclewire@1/dist/dom.min.js';
</script>
```

For production, pin an exact version (`cyclewire@1.0.0`) and add the
[Subresource Integrity](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity)
hash published with each [release](https://github.com/CycleChain/CycleWire/releases).

---

## 🧩 How it works

```text
 Server renders HTML ──► browser paints it, fully usable as links and forms
                              │
                     CycleWire core, 4.9 kB: one listener per event type
                              │
         pointer / focus ─────┼────► preload: modulepreload the action (no execution)
                              │
         click / submit / … ──┴────► resolve element → import action → yield → run
                                             ▲
         cw-trigger: load · idle · visible · media:(…) ─┘
```

Every interactive element carries its intent in markup (`cw-action="cart#add"`).
One delegated listener per event type finds the element, looks the name up in the action
registry, imports that module the first time, and calls the handler with a context object.
This is Qwik's resumability without Qwik's compiler: the server is the source of truth,
and the client never rebuilds a component tree. [Concepts](docs/concepts.md) walks
through it.

---

## 🏷️ HTML attributes

All attributes use the `cw-` prefix by default. `start({ prefix: 'x-' })` moves
them to `data-x-action` and friends, and `prefix: ''` drops the prefix.

| Attribute | Purpose |
| --- | --- |
| `cw-action="name"` | Runs `name` on the element's natural event: `submit` for forms, `input` or `change` for controls, `toggle` for `<details>`, `click` otherwise |
| `cw-on-<event>="name"` | Runs `name` on any delegated event, e.g. `cw-on-keydown`, `cw-on-command` |
| `cw-trigger` | Runs without an event: `load`, `idle`, `visible`, `media:(min-width: 60em)` |
| `cw-preload` | When to fetch the module: `intent` (default), `visible`, `idle`, `load`, `none` |
| `cw-props='{…}'` | JSON handed to the handler as `ctx.props` |
| `cw-prevent` | `preventDefault()` for all bound events, or a list (`"click keydown"`); `none` disables the automatic prevent for forms and submit buttons |
| `cw-once` | Only one successful run |
| `cw-debounce="ms"` | Wait for a pause in events |
| `cw-concurrency` | `drop` (clicks, submits), `restart` (input), `latest` (change, toggle), `parallel` |
| `cw-ignore` | Stop looking for bindings above this element (use it on user-generated content) |
| `cw-pending` | Set by CycleWire while a run is in flight; style it |

Names are `module` or `module#export`. A module's `run` export, or its default export,
handles bare names. The full reference is in [docs/html-api.md](docs/html-api.md).

---

## ⚙️ Writing actions

```js
export async function run(ctx) {
    ctx.event;    // the triggering Event (null for triggers and run())
    ctx.target;   // the innermost event target
    ctx.element;  // the element that carries the binding
    ctx.signal;   // AbortSignal: a newer run, removal or stop() aborts it
    ctx.props;    // parsed cw-props
    ctx.action;   // "module#export"
    ctx.wire;     // the CycleWire API
}
```

Return values are dispatched with `cw:done`, and errors with `cw:error` or your `onError`.
Because the handler runs after the event has been dispatched, calling
`ctx.event.preventDefault()` there has no effect; use `cw-prevent` instead. Details,
patterns and caveats are in [docs/actions.md](docs/actions.md).

---

## 🔌 Core first, modules when you need them

The core covers activation on its own: clicks, forms, inputs, triggers, preloading,
concurrency and shadow DOM. Add a module when a feature needs it, ideally by importing it from the action that uses it, so it downloads
with that action and pages that never use it never pay for it.
[docs/modules.md](docs/modules.md) has core-only recipes, a decision table and every way to
load a module.

```js
import { css } from 'cyclewire/css';
await css('/css/vendor/flatpickr.css', element); // applied before the widget is built

import { html, swap } from 'cyclewire/dom';
swap(list, html`${items.map((item) => html`<li>${item.name}</li>`)}`); // escaped by context

import { morph } from 'cyclewire/morph';
const res = await fetch('/cart/partial');
await morph(cart, html.raw(await res.text()), { transition: true }); // keeps focus and state

import { start } from 'cyclewire';
import { signals } from 'cyclewire/signals';
start({ plugins: [signals()] }); // cw-state + cw-bind, resumed on first touch

import { bootstrap } from 'cyclewire/bootstrap';
start({ plugins: [bootstrap({ global: true })] }); // Bootstrap data API, no bootstrap.js

import { connect } from 'cyclewire/stream';
connect('/rooms/42/events'); // the server streams <cw-stream op="append" target="messages"> updates

import { prefetch } from 'cyclewire/prefetch';
start({ plugins: [prefetch()] }); // cw-prefetch data arrives with the code, not after it
```

### 🎨 Styles that ship with an action

The CSS of visible content has to arrive before it paints, so it stays render-blocking
on purpose. But a date picker, an editor or a map only exists after its action runs, so
its stylesheet can wait for the action:

```js
import { start } from 'cyclewire';
import { styles } from 'cyclewire/css';

start({
    actions: {
        datepicker: { module: '/js/actions/datepicker.js', css: '/css/vendor/flatpickr.css' },
    },
    plugins: [styles()],
});
```

With the `styles()` plugin of `cyclewire/css` (0.6 kB), the stylesheet is preloaded with
the module on intent and applied before the handler runs, so it never blocks the first
render and the widget never appears unstyled. [docs/css.md](docs/css.md) covers the rest
of the CSS strategy.

### Why no virtual DOM?

A virtual DOM re-renders the HTML the server already produced so it can diff it, and
that is exactly the hydration cost this architecture exists to avoid. CycleWire gets
the same benefits another way:
- `morph()` compares DOM to DOM and keeps focus, typed input, iframes and media.
- `html` parses into an inert `<template>` and hands over a `DocumentFragment`, so markup
  is built safely and inserted in one operation.

---

## 🧱 Works with your stack

[docs/integrations.md](docs/integrations.md) has recipes for:
- **Backends:** Laravel/Blade, Rails, Django, plain PHP.
- **Frameworks and build tools:** Astro, Vite (`fromGlob(import.meta.glob(…))`),
  webpack, React/Vue/Svelte islands.
- **Alongside other libraries:** htmx, Turbo, Web Components.

**React, Vue and Svelte:** CycleWire can load your islands, hydrating a server-rendered
component only when it scrolls into view, and components can use CycleWire actions. See
[docs/frameworks.md](docs/frameworks.md).

**SweetAlert2, Flatpickr, DataTables, jQuery:** import a library in the action that uses
it, and it loads when it is needed: the date picker on the field's first focus, the table
enhancements when the table scrolls into view. See [docs/libraries.md](docs/libraries.md).

Both have runnable [examples](examples/README.md), tested in Chromium, Firefox and WebKit
and [live on GitHub Pages](https://cyclechain.github.io/CycleWire/examples/).

---

## 🛠️ Tools

```sh
npx cyclewire check    # every cw-* value in your templates, against your actions
```

- **`cyclewire check`** reads HTML, Blade, ERB, Django, Jinja, Twig, JSX, Vue, Svelte and
  Astro templates and reports actions that are not registered, exports that do not exist
  and values CycleWire does not understand, with suggestions (`did you mean "cart#add"?`)
  and annotations on GitHub pull requests. [CLI docs](docs/cli.md)
- **`cyclewire/vite`** registers an actions directory as chunks, re-registers an action
  when you edit it instead of reloading the page, and keeps the declarations of your
  action names up to date. [Vite plugin](docs/vite.md)
- **`defineAction<Props>()`** types a handler's props, and with the generated names
  `run('cart#ad')` is a compile error. [TypeScript](docs/typescript.md)
- **`cyclewire/devtools`** is an inspector inside the page: registered and loaded actions,
  every run and how it ended, the development build's trace, waiting triggers, and what
  any element is bound to. Alt+Shift+W, or `devtools: true` in the Vite plugin.
  [Devtools](docs/devtools.md)

## 🌐 Browser support

The core needs an ES2020 browser: Chrome/Edge 86+, Firefox 78+ or Safari 14+. Newer
platform features are detected at runtime and fall back gracefully. The test suite runs
on current Chromium, Firefox and WebKit. [docs/browser-support.md](docs/browser-support.md)
lists every feature and its fallback.

---

## 📏 Size

Minified, measured by `npm run size` and enforced in CI:

<!-- size:start -->
| File | brotli | gzip |
| --- | --- | --- |
| `cyclewire.min.js` (core) | 4.9 kB | 5.4 kB |
| `css.min.js` | 0.6 kB | 0.7 kB |
| `dom.min.js` | 2.2 kB | 2.4 kB |
| `morph.min.js` (includes what it needs from dom) | 2.2 kB | 2.5 kB |
| `signals.min.js` | 3.4 kB | 3.8 kB |
| `stream.min.js` (includes dom and morph) | 3.7 kB | 4.1 kB |
| `prefetch.min.js` (a plugin) | 0.5 kB | 0.6 kB |
| `bootstrap.min.js` | 2.1 kB | 2.4 kB |
| `devtools.min.js` (development only) | 7.0 kB | 7.9 kB |
| `cyclewire.global.min.js` (core + auto start) | 5.1 kB | 5.6 kB |
| `cyclewire.full.global.min.js` (everything) | 15.0 kB | 16.5 kB |
<!-- size:end -->

---

## 📊 Benchmark

One product page, built with each stack the way its documentation recommends and measured
the same way in Chromium on GitHub's runners:
[charts and tables](https://cyclechain.github.io/CycleWire/#benchmark) ·
[methodology](bench/METHODOLOGY.md) · [run it yourself](bench/README.md). The benchmark is
maintained by the authors of CycleWire, which is one of the stacks measured, so every app,
the runner and the raw data are in [`bench/`](bench/), and corrections from the other
projects are welcome. There is no overall score.

<!-- bench:start -->
Medians, lower is better. Time to effect runs from the input to the frame that shows the result;
"Early tap" is a tap on "Add to cart" in the first frame after first paint. The
[website](https://cyclechain.github.io/CycleWire/#benchmark) charts each metric with its 95% confidence
interval, and lists more metrics and how each app is built.

**Mobile**: slow 4G, 4× CPU slowdown, touch. 15 iterations on 2026-09-26, AMD EPYC 9V74 80-Core Processor (4 cores, GitHub's hosted runner), Chrome 153.0.8010.12.

| Stack | JavaScript | LCP | TBT | Add to cart | Category filter | Live search | Quick view | Newsletter | Early tap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static HTML (control) | 0.0 kB | 1,580 ms | 0 ms | 1,351 ms | 749 ms | 783 ms | 767 ms | 1,368 ms | by a page load, 1,624 ms |
| Vanilla JS (control) | 1.2 kB | 1,584 ms | 0 ms | 700 ms | 113 ms | 9 ms | 692 ms | 696 ms | in the page, 832 ms |
| Alpine.js | 17.9 kB | 1,728 ms | 30 ms | 698 ms | 130 ms | 15 ms | 698 ms | 700 ms | by a page load, 1,739 ms |
| Angular | 87.5 kB | 1,772 ms | 89 ms | 709 ms | 131 ms | 20 ms | 716 ms | 710 ms | by a page load, 1,652 ms |
| Astro + Preact | 13.1 kB | 1,580 ms | 0 ms | 695 ms | 117 ms | 11 ms | 710 ms | 699 ms | by a page load, 1,664 ms |
| CycleWire | 12.2 kB | 1,640 ms | 0 ms | 707 ms | 119 ms | 11 ms | 607 ms | 705 ms | in the page, 854 ms |
| CycleWire, inline (variant) | 6.9 kB | 1,420 ms | 0 ms | 715 ms | 136 ms | 12 ms | 610 ms | 712 ms | in the page, 860 ms |
| CycleWire, intent only (variant) | 5.8 kB | 1,612 ms | 0 ms | 1,217 ms | 615 ms | 12 ms | 638 ms | 707 ms | in the page, 1,753 ms |
| Hotwire (Turbo + Stimulus) | 31.9 kB | 1,680 ms | 0 ms | 726 ms | 756 ms | 842 ms | 747 ms | 730 ms | by a page load, 1,620 ms |
| htmx | 15.4 kB | 1,536 ms | 0 ms | 706 ms | 736 ms | 832 ms | 708 ms | 710 ms | in the page, 863 ms |
| Marko | 4.9 kB | 1,608 ms | 0 ms | 700 ms | 118 ms | 12 ms | 694 ms | 704 ms | in the page, 833 ms |
| Next.js | 120.1 kB | 2,012 ms | 71 ms | 757 ms | 728 ms | 830 ms | 1,297 ms | 717 ms | by a page load, 996 ms |
| Next.js, client filtering (variant) | 119.2 kB | 1,840 ms | 70 ms | 739 ms | 137 ms | 19 ms | 1,302 ms | 717 ms | by a page load, 984 ms |
| Nuxt | 70.9 kB | 2,016 ms | 77 ms | 702 ms | 148 ms | 33 ms | 724 ms | 699 ms | by a page load, 1,690 ms |
| Qwik City | 37.4 kB | 1,720 ms | 0 ms | 791 ms | 178 ms | 30 ms | 761 ms | 793 ms | in the page, 2,465 ms |
| SolidStart | 31.1 kB | 1,572 ms | 0 ms | 710 ms | 124 ms | 13 ms | 713 ms | 699 ms | by a page load, 1,664 ms |
| SvelteKit | 32.8 kB | 1,800 ms | 0 ms | 1,290 ms | 138 ms | 17 ms | 623 ms | 1,302 ms | by a page load, 959 ms |

Where another stack beats CycleWire here (the 95% confidence intervals do not overlap and the difference is at least 3%): First Contentful Paint (Astro + Preact 1,196 ms, CycleWire 1,256 ms); Largest Contentful Paint (htmx 1,536 ms, CycleWire 1,640 ms); JavaScript (Marko 4.9 kB, CycleWire 12.2 kB); HTML (Hotwire (Turbo + Stimulus) 2.7 kB, CycleWire 2.8 kB); Requests (Alpine.js 24, CycleWire 28); Script (Qwik City 12 ms, CycleWire 20 ms); Layout (htmx 26 ms, CycleWire 27 ms); Bytes, repeat visit (Hotwire (Turbo + Stimulus) 2.7 kB, CycleWire 2.8 kB); Event listeners (Marko 9, CycleWire 18).

**Desktop**: fast connection, no CPU slowdown, mouse. 15 iterations on 2026-09-26, AMD EPYC 7763 64-Core Processor (4 cores, GitHub's hosted runner), Chrome 153.0.8010.12.

| Stack | JavaScript | LCP | TBT | Add to cart | Category filter | Live search | Quick view | Newsletter | Early tap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static HTML (control) | 0.0 kB | 376 ms | 0 ms | 432 ms | 269 ms | 314 ms | 272 ms | 432 ms | by a page load, 504 ms |
| Vanilla JS (control) | 1.2 kB | 380 ms | 0 ms | 250 ms | 99 ms | 11 ms | 251 ms | 251 ms | in the page, 284 ms |
| Alpine.js | 17.9 kB | 380 ms | 0 ms | 250 ms | 100 ms | 27 ms | 251 ms | 251 ms | in the page, 290 ms |
| Angular | 87.5 kB | 388 ms | 0 ms | 250 ms | 113 ms | 26 ms | 266 ms | 251 ms | in the page, 300 ms |
| Astro + Preact | 13.1 kB | 388 ms | 0 ms | 251 ms | 87 ms | 13 ms | 251 ms | 251 ms | by a page load, 521 ms |
| CycleWire | 9.5 kB | 384 ms | 0 ms | 250 ms | 99 ms | 7 ms | 114 ms | 250 ms | in the page, 284 ms |
| CycleWire, inline (variant) | 4.1 kB | 396 ms | 0 ms | 266 ms | 116 ms | 8 ms | 115 ms | 267 ms | in the page, 300 ms |
| CycleWire, intent only (variant) | 5.8 kB | 380 ms | 0 ms | 249 ms | 99 ms | 9 ms | 115 ms | 251 ms | in the page, 382 ms |
| Hotwire (Turbo + Stimulus) | 31.9 kB | 380 ms | 0 ms | 266 ms | 183 ms | 385 ms | 216 ms | 266 ms | in the page, 299 ms |
| htmx | 15.3 kB | 428 ms | 0 ms | 250 ms | 255 ms | 371 ms | 251 ms | 251 ms | in the page, 286 ms |
| Marko | 4.8 kB | 384 ms | 0 ms | 250 ms | 87 ms | 8 ms | 251 ms | 251 ms | in the page, 284 ms |
| Next.js | 120.1 kB | 392 ms | 0 ms | 256 ms | 252 ms | 371 ms | 416 ms | 250 ms | in the page, 455 ms |
| Next.js, client filtering (variant) | 119.2 kB | 392 ms | 0 ms | 255 ms | 100 ms | 11 ms | 416 ms | 250 ms | – |
| Nuxt | 70.9 kB | 388 ms | 0 ms | 250 ms | 105 ms | 27 ms | 251 ms | 251 ms | in the page, 284 ms |
| Qwik City | 37.4 kB | 392 ms | 0 ms | 284 ms | 105 ms | 29 ms | 267 ms | 284 ms | in the page, 484 ms |
| SolidStart | 31.1 kB | 396 ms | 0 ms | 250 ms | 99 ms | 12 ms | 99 ms | 251 ms | in the page, 284 ms |
| SvelteKit | 32.7 kB | 396 ms | 0 ms | 402 ms | 116 ms | 13 ms | 99 ms | 403 ms | in the page, 520 ms |

Where another stack beats CycleWire here (the 95% confidence intervals do not overlap and the difference is at least 3%): First Contentful Paint (Astro + Preact 348 ms, CycleWire 384 ms); JavaScript (Marko 4.8 kB, CycleWire 9.5 kB); HTML (Hotwire (Turbo + Stimulus) 2.7 kB, CycleWire 2.8 kB); Requests (Alpine.js 40, CycleWire 42); Layout (htmx 9.6 ms, CycleWire 10 ms); Quick view (SolidStart 99 ms, CycleWire 114 ms); Bytes, repeat visit (Hotwire (Turbo + Stimulus) 2.7 kB, CycleWire 2.8 kB); Event listeners (Marko 9, CycleWire 18).

<!-- bench:end -->

---

## 🔒 Security

- Markup can only reach code through names you register. There is no `eval`, no
  `new Function`, and no URL is ever read from markup.
- `html` escapes by context, refuses positions escaping cannot protect, and rejects
  `javascript:` URLs however the attribute value is put together.
- Nothing inside `cw-ignore` activates: no actions, triggers, preloads or bindings.
- Parsed fragments stay inert until they are inserted, and inserted `<script>` elements
  never run.
- The library works under strict CSP and Trusted Types.

See [docs/security.md](docs/security.md), including a DOMPurify recipe for user-generated
content, and [SECURITY.md](SECURITY.md) for reporting.

---

## 🚢 Versioning and releases

- CycleWire follows [Semantic Versioning](https://semver.org). Every release is an
  annotated git tag (`v1.0.0`, `v1.1.0`, …) with a
  [GitHub Release](https://github.com/CycleChain/CycleWire/releases). Its notes come from
  [CHANGELOG.md](CHANGELOG.md), and the built files and SRI hashes are attached.
- Releases are published to npm from GitHub Actions with
  [trusted publishing](https://docs.npmjs.com/trusted-publishers/), so every version from
  1.0.1 on carries a signed provenance attestation.
- On a CDN, `cyclewire@1` follows the latest 1.x release, and `cyclewire@1.0.0` pins one.

The release process is documented in [docs/releasing.md](docs/releasing.md).

---

## 📚 Documentation

| Guide | |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, first action, first trigger |
| [Concepts](docs/concepts.md) | The architecture, compared with Qwik |
| [HTML API](docs/html-api.md) · [JavaScript API](docs/js-api.md) | Complete reference |
| [TypeScript](docs/typescript.md) · [Command line](docs/cli.md) · [Vite plugin](docs/vite.md) · [Devtools](docs/devtools.md) | Typed actions, template checks, edits without reloads, an in-page inspector |
| [Actions](docs/actions.md) | Context, signals, concurrency, errors, patterns |
| [css](docs/css.md) · [dom](docs/dom.md) · [morph](docs/morph.md) · [signals](docs/signals.md) · [plugins](docs/plugins.md) | Optional modules |
| [Shadow DOM](docs/shadow-dom.md) | Web Components and declarative shadow DOM |
| [Integrations](docs/integrations.md) | Backends, frameworks, bundlers |
| [Frameworks](docs/frameworks.md) · [Libraries](docs/libraries.md) · [Examples](examples/README.md) | React, Vue and Svelte islands; Flatpickr, SweetAlert2, DataTables, jQuery |
| [Performance](docs/performance.md) · [Security](docs/security.md) · [Browser support](docs/browser-support.md) | |
| [Core first, modules later](docs/modules.md) · [CSS strategy](docs/css.md) | Choosing what to load |
| [Releasing](docs/releasing.md) | For maintainers |

---

## 🤝 Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup,
tests and the size budgets.

## 📄 License

[MIT](LICENSE) © 2026 [CycleChain](https://cyclechain.io)
