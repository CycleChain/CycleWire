# Changelog

All notable changes to CycleWire are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`cyclewire/early`** (0.4 kB brotli), a script to inline at the top of `<head>`. Until
  CycleWire starts, it keeps the clicks, typing and changes on bound elements, and marks
  a tapped control `cw-pending` at once; `start()` then runs them in order. Links and
  forms are left to the browser, and where CycleWire would have taken the place of their
  default (a submit button, a link with `cw-prevent`), the action does not run as well.
  `earlyScript(prefix)` returns the script for a server to inline, `dist/early.min.js`
  is the same for the default prefix, and the Vite plugin adds it with `early: true`.

## [1.1.0] - 2026-09-26

### Added

- `registered()`: the names of the registered action modules, imported or not.
- `defineAction(handler)`: returns the handler, typed with its props and element:
  `defineAction<{ sku: string }, HTMLFormElement>(…)`.
- A `trace(event)` plugin hook, called by the development build only, that reports what
  the core schedules, fetches, skips and runs. The production build carries none of it.
- Generic types: `Context<Props, Element>` and `Action<Props, Element>`. Once a global
  `CycleWireActions` interface lists the actions, `ActionName` is their union, `run()`
  and `preload()` accept only those names, and `PropsOf<Name>` is a handler's props.
- **`cyclewire check`**, a command that reads your templates (HTML, Blade, ERB, Django,
  Jinja, Twig, Liquid, Handlebars, JSX, Vue, Svelte, Astro) and reports actions that are
  not registered or exports that do not exist, with suggestions, and values CycleWire
  does not understand. `--format github` annotates pull requests; `--unused` lists the
  actions no template uses. Configured with JSON only; no dependencies.
- **`cyclewire types`**, which writes the `CycleWireActions` declarations from your
  actions directory.
- **`cyclewire/vite`**, a Vite plugin: `virtual:cyclewire/actions` registers an actions
  directory as chunks; an edited action is registered again instead of reloading the
  page; the declarations stay up to date; `index.html` is checked; and the build writes a
  manifest `cyclewire check` can read. `vite` is an optional peer dependency.
- **`cyclewire/stream`** (3.3 kB brotli with `dom` and `morph`): the server changes the
  page with `<cw-stream op="append|prepend|before|after|inner|outer|morph|remove">`
  messages, over Server-Sent Events (`connect()`) or in any response (`apply()`).
  Connections are shared per URL, reconnect with the last event id and a growing delay,
  close when their element leaves the page, and step aside for the back/forward cache and
  prerendering. The `streams({ channels })` plugin subscribes `cw-stream` elements
  to the channels you list, on your own origin only. `<cw-stream>` is not a custom
  element, so markup that reaches the page any other way does nothing. The full
  classic-script build includes it.
- **`cyclewire/devtools`**: an inspector that runs inside the page. Its panel lists the
  registered actions (loaded or not, the elements that bind them, runs and errors), every
  run with its event, concurrency mode, duration and status, the development build's
  trace and the `cw:*` events, the triggers and scheduled preloads in the page, and the
  bindings of any element you pick. Open it with the `devtools()` plugin, with `install()`,
  or from a bookmarklet on any page; Alt+Shift+W toggles it. It also works with the
  production build and with 1.0.x, and costs nothing unless imported (`devtools.min.js`,
  about 7 kB brotli).
- Server helpers (`docs/server-helpers.md`): a copy-in `cw()` for PHP (with a Blade
  directive), Ruby (with a Rails helper), Python (with a Django template tag) and
  JavaScript (for template literals and JSX). It writes the `cw-*` attributes,
  escapes them for HTML and throws on a misspelt name, option or value. Each helper is
  tested in its own language against one set of shared cases, and CI checks that the
  docs quote the tested files.

- **A documentation site** at [cyclechain.github.io/CycleWire/docs/](https://cyclechain.github.io/CycleWire/docs/),
  built from `docs/*.md` with search. The Markdown files stay the only source; the build
  checks every link and anchor.
- **`cyclewire/prefetch`** (0.5 kB brotli): data fetched on intent, next to the
  action's code. An element names a URL with `cw-prefetch`; when the pointer, focus or a
  finger reaches it, the plugin starts a GET of that URL on the page's own origin, and
  the handler's `ctx.fetch` takes the response that is already on its way. The code and
  the data then arrive together instead of one after the other.
- An `intent(element)` plugin hook, called whenever the user heads for an element that
  binds actions.
- The package exports its CDN builds as `cyclewire/dist/*.min.js`, so a server can
  resolve the classic-script build to inline it in `<head>`.

### Changed

- **Attributes are written `cw-action`, not `data-cw-action`.** Every name in the
  vocabulary drops `data-`: `cw-action`, `cw-on-click`, `cw-props`, `cw-trigger`,
  `cw-preload`, `cw-pending`, `cw-state`, `cw-bind`, `cw-store`, `cw-key`, and so on,
  as short to write as htmx's `hx-*` or Alpine's `x-*`. The `prefix` option now names the
  whole start of the attribute (`'x-'` gives `x-action`, and `''` still means
  `data-action`); the helpers, `cyclewire check` and the Vite plugin follow it.
- **Touch screens look ahead.** Where the primary input cannot hover, intent arrives
  with the tap, too late for a module to load over a slow connection. By default the
  modules of `cw-action` elements without `cw-preload` are now also fetched
  once the page is idle, as their elements near the viewport. `start({ preload })`
  chooses: `'auto'` (the default), `'visible'` (on every screen) or `'intent'` (the 1.0
  behaviour). The benchmark's mobile profile showed the first category filter and quick
  view waiting for their code.
- **Intent fetches modules whose scheduled preload has not happened yet.** Hovering,
  focusing or touching an element with `cw-preload="idle"` or `"visible"` now
  fetches its modules at once; only `none` opts out.
- **Quick handlers run at once.** A handler whose module is in memory no longer waits
  for a paint unless its synchronous part held the main thread for more than 10 ms the
  last time it ran, per action and per device. Its result then lands in the next frame
  instead of the one after. Slow handlers still let the pressed state paint first.
- **Speculative preloads step aside.** URL entries are preloaded at high priority on
  intent and for `cw-preload="load"`, and at low priority for `visible`, `idle` and the
  touch look-ahead, so they never hold up the page's own images.
- Size budgets, brotli: `cyclewire.min.js` 5120 B (measured 4952 B), `prefetch.min.js`
  768 B, `stream.min.js` 4096 B, `signals.min.js` 3520 B, `morph.min.js` 2304 B, and the
  classic builds 5376 B and 15488 B; the full one now includes `cyclewire/stream` and
  `cyclewire/prefetch`.

### Fixed

- **A computed no longer runs again when nothing it read has changed.** A write
  upstream marked every computed below it stale, and each ran again even when the
  computed between them came out the same; now a stale computed first checks the
  versions of what it read, as the documentation always said it did.
- A computed whose function threw runs again the next time it is read, instead of
  returning its last value; an effect disposed during its own run stays unsubscribed.
- `morph()` puts an `xlink:href` it adds to SVG in the XLink namespace, so a `<use>` it
  gives one points at its symbol.
- The production modules of `cyclewire/prefetch` and `cyclewire/stream` no longer
  import `util.js` for nothing: a page that loads them without a bundler makes one
  request fewer, and esbuild stops warning about the import.

### Performance

- One `load` listener and one idle callback serve every `idle` trigger and preload,
  instead of one per element.
- Finding an element's actions no longer creates an `Attr` node for each of its
  attributes, so hovering over the page leaves no nodes behind.
- **`cyclewire/signals` is two to five times faster.** A computed or an effect that
  runs again walks the list of what its last run read and changes no subscription
  while it reads the same sources in the same order; a source it reads twice is
  listed once; and a source with one subscriber keeps it without a set. On the
  benchmark's micro suite it moved from last in every scenario to first on dynamic
  graphs, ahead of Vue on most, and close to Preact and alien-signals on the rest.
  `signals.min.js` grows to 3417 B brotli (budget 3520 B).
- **`morph()` moves only what changed places, and skips what did not change.** It pairs
  the new children with the old ones first, then leaves the longest run already in
  order where it is: swapping two rows of a thousand moves two rows instead of every row
  between them (8 DOM mutations instead of 3,990). A subtree equal to its new markup is
  left alone after one native comparison. On 1,000 keyed rows it is now faster than
  morphdom at every operation the micro suite measures, for example 6.4 ms against
  10.7 ms to update every tenth row (15 ms before). `morph.min.js` grows to 2196 B
  brotli (budget 2304 B); the full classic build's budget becomes 15488 B.
- The pointer-over handler skips elements without attributes, the look-ahead decides
  once per scanned subtree instead of once per element, and plugins' `preload` hooks run
  once per module instead of on every hover.

## [1.0.1] - 2026-09-25

### Security

- **`html` refused `javascript:` URLs only in the simplest case.** A value split across
  interpolations (`href="${a}${b}"`), passed as an array or as nested `html`, preceded by
  fixed text such as a space, or set through SVG animation attributes (`to`, `from`, `by`,
  `values`) could still produce a script URL. The whole attribute value is now checked as
  the browser reads it, and templates that end inside a tag, a comment or a raw-text
  element are refused.
- **`data-cw-ignore` only stopped event handling from reaching outer bindings.** Elements
  inside it that carried their own bindings still ran, and `load`/`visible` triggers,
  preloads and signals bindings inside it still activated. Nothing inside it activates
  now, across shadow roots too.
- **Signals `attr.*` bindings could write event handlers, `srcdoc` and script URLs.**
  They are refused now, with a warning in the development build.

### Changed

- Size budgets: `dom.min.js` 2304 B and `signals.min.js` 3200 B (brotli), for the checks
  above.

## [1.0.0] - 2026-09-25

First public release: a zero-dependency engine that makes server-rendered HTML
interactive without hydration.

### Added

- **Core** (`cyclewire`):
  - one delegated listener per event type;
  - a strict action registry: loader functions, URLs or import-map specifiers;
  - `data-cw-action` and `data-cw-on-<event>` bindings, and `module#export` names;
  - triggers: `load`, `idle`, `visible`, `media:`;
  - intent, visible, idle and load preloading with `modulepreload`;
  - concurrency modes: `drop`, `restart`, `latest`, `parallel`;
  - `data-cw-once`, `data-cw-debounce`, `data-cw-props` and `data-cw-ignore`;
  - a cancelable `cw:run` event, plus `cw:done` and `cw:error`;
  - `run()`, `observe()` for shadow roots, `fromGlob()` for Vite, and a configurable
    attribute prefix;
  - plugins with `setup`, `context`, `scan`, `preload` and `load` hooks, and object
    registry entries (`{ module, … }`) that carry options for them.
- **`cyclewire/css`**: stylesheets that arrive with the actions that need them. With the
  `styles()` plugin, a registry entry lists the CSS its UI needs (`{ module, css }`); the
  CSS is preloaded with the module on intent and applied before the handler runs, inside
  shadow roots too. `css()` loads stylesheets from code.
- **`cyclewire/auto`** and classic-script builds that read
  `<script type="application/json" data-cyclewire>` and expose `window.CycleWire`.
- **`cyclewire/dom`**: context-aware `html` tagged templates, inert `fragment()`
  parsing, `swap()` and `transition()` (View Transitions), Trusted Types support.
- **`cyclewire/morph`**: DOM morphing that keeps elements by id or `data-cw-key`,
  uses `moveBefore()` where available, and preserves focus and user input.
- **`cyclewire/signals`**: signals, computed values, effects, deep reactive stores,
  and `data-cw-state` / `data-cw-store` / `data-cw-bind` activated lazily from
  server-serialized state.
- **`cyclewire/bootstrap`**: the Bootstrap 5 data API (collapse, dropdown, modal,
  offcanvas, tab, alert) without Bootstrap's JavaScript.
- TypeScript declarations, a development build with warnings, and size budgets in CI.
- Guides and runnable examples for React, Vue and Svelte islands, and for Flatpickr,
  SweetAlert2, DataTables and jQuery, tested in Chromium, Firefox and WebKit and live
  on GitHub Pages.

[Unreleased]: https://github.com/CycleChain/CycleWire/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/CycleChain/CycleWire/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/CycleChain/CycleWire/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CycleChain/CycleWire/releases/tag/v1.0.0
