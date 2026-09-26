# Changelog

All notable changes to CycleWire are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  prerendering. The `streams({ channels })` plugin subscribes `data-cw-stream` elements
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
  JavaScript (for template literals and JSX). It writes the `data-cw-*` attributes,
  escapes them for HTML and throws on a misspelt name, option or value. Each helper is
  tested in its own language against one set of shared cases, and CI checks that the
  docs quote the tested files.

- **A documentation site** at [cyclechain.github.io/CycleWire/docs/](https://cyclechain.github.io/CycleWire/docs/),
  built from `docs/*.md` with search. The Markdown files stay the only source; the build
  checks every link and anchor.

### Changed

- **Touch screens look ahead.** Where the primary input cannot hover, intent arrives
  with the tap, too late for a module to load over a slow connection. By default the
  modules of `data-cw-action` elements without `data-cw-preload` are now also fetched
  once the page is idle, as their elements near the viewport. `start({ preload })`
  chooses: `'auto'` (the default), `'visible'` (on every screen) or `'intent'` (the 1.0
  behaviour). The benchmark's mobile profile showed the first category filter and quick
  view waiting for their code.
- Size budgets: `stream.min.js` 4096 B, and `cyclewire.full.global.min.js` 14336 B
  (brotli), which now includes `cyclewire/stream`.
- **Intent fetches modules whose scheduled preload has not happened yet.** Hovering,
  focusing or touching an element with `data-cw-preload="idle"` or `"visible"` now
  fetches its modules at once; only `none` opts out.

### Performance

- One `load` listener and one idle callback serve every `idle` trigger and preload,
  instead of one per element.
- Finding an element's actions no longer creates an `Attr` node for each of its
  attributes, so hovering over the page leaves no nodes behind.

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

[Unreleased]: https://github.com/CycleChain/CycleWire/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/CycleChain/CycleWire/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CycleChain/CycleWire/releases/tag/v1.0.0
