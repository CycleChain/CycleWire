# CycleWire documentation

CycleWire turns server-rendered HTML into instant interactivity on intent: one small
delegated listener per event type, and action code imported only when someone reaches
for it.

## Start here

1. [Getting started](getting-started.md): install, first action, first trigger.
2. [Concepts](concepts.md): how activation, preloading and the registry fit together,
   and how this compares with Qwik.
3. [Actions](actions.md): writing handlers, and what the context object gives you.

## Reference

- [HTML API](html-api.md): every attribute.
- [JavaScript API](js-api.md): `start`, `register`, `run`, `observe` and friends.

## Tools

- [TypeScript](typescript.md): typed handlers and props, and action names checked by
  the compiler.
- [Command line](cli.md): `cyclewire check` finds unknown actions and invalid values in
  your templates; `cyclewire types` writes the declarations.
- [Vite plugin](vite.md): an actions directory as chunks, edits without reloads, and the
  declarations kept up to date.

## Optional modules

- [Core first, modules when you need them](modules.md): what the core covers on its own,
  when to add each module, and how to load a module only with the action that needs it.
- [css](css.md#stylesheets-that-belong-to-an-action): stylesheets that arrive with the
  actions that need them.
- [dom](dom.md): `html` templates escaped by context, inert fragments, `swap`,
  `transition`.
- [morph](morph.md): update the page from server HTML while keeping state.
- [signals](signals.md): reactivity that resumes from state the server serialized.
- [stream](stream.md): the server changes the page with HTML messages, over Server-Sent
  Events or in any response.
- [plugins](plugins.md): the Bootstrap data-API plugin, and writing your own.
- [devtools](devtools.md): an in-page inspector for actions, runs, the trace, triggers and
  bindings, as a plugin, from code or as a bookmarklet.

## Guides

- [Shadow DOM and Web Components](shadow-dom.md)
- [Integrations](integrations.md): Laravel, Rails, Django, PHP, Astro, Vite, React, Vue,
  Svelte, htmx, Turbo.
- [React, Vue, Svelte and other frameworks](frameworks.md): islands that CycleWire loads
  and hydrates, and CycleWire actions inside components.
- [Popular libraries](libraries.md): Flatpickr, SweetAlert2, DataTables, jQuery and more,
  each loaded when it is needed.
- [Examples](../examples/README.md): runnable React, Vue, Svelte and library examples.
- [CSS strategy](css.md): what to defer, what not to, and stylesheets that ship with
  an action.
- [Performance](performance.md), and the [benchmark](../bench/README.md): one page built
  with each stack, measured the same way.
- [Security](security.md)
- [Browser support](browser-support.md)
- [Releasing](releasing.md), for maintainers.
