# Changelog

All notable changes to CycleWire are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/CycleChain/CycleWire/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/CycleChain/CycleWire/releases/tag/v1.0.0
