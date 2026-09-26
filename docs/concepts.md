# Concepts

## The problem

Most interactive pages ship a framework runtime and the code for every component, then
**hydrate**: they re-run components on the client to attach listeners to HTML the server
already rendered. On a mid-range phone this is the long task that makes the first tap
feel dead. The page looks ready before it is.

## The idea

The server's HTML is already correct. The only thing missing is the ability to react.
So CycleWire:

1. **Writes intent into the markup.** `cw-action="cart#add"` says what should happen
   and on which element.
2. **Listens once per event type.** A single delegated `click` listener serves every
   button on the page. Content added later is covered automatically.
3. **Fetches code when intent appears.** Hover, focus or touch starts downloading the
   module with `modulepreload`, which fetches and compiles it without running it.
4. **Runs code when the event happens.** It imports the module (usually already in
   memory by now), yields so the pressed state can paint, and calls the handler.

Nothing runs on load. No component tree is rebuilt, and nothing is "resumed" beyond
reading an attribute.

```text
                 load                         intent                     interaction
Server HTML ─► [ 4.9 kB core ] ─► pointerover/focus ─► modulepreload ─► click ─► import ─► yield ─► run
                    │
                    └─ triggers: load · idle (after load) · visible (IntersectionObserver) · media:(query)
```

## The pieces

### Registry

Markup never names a file. It names an action, and the registry maps names to loaders:

```js
start({
    actions: {
        cart: () => import('./actions/cart.js'), // a loader function (bundlers)
        map: '/js/actions/map.js',               // a URL, resolved against the page
        chart: 'app/chart',                      // a bare specifier, resolved by the import map
        datepicker: { module: '/js/actions/datepicker.js', css: '/css/flatpickr.css' }, // with options for plugins
    },
});
```

A name that is not registered can never be imported. That is what keeps markup, including
markup an attacker managed to inject, from reaching arbitrary code. See
[security](security.md).

### Delegation

For each event type (`click`, `submit`, `input`, `change`, `keydown`, `keyup`, `focusin`,
`focusout`, `pointerdown`, `toggle`, `command`, plus whatever you `listen()` to), CycleWire
adds one listener to the document:
- Events that bubble are handled in the bubble phase, so your framework's handlers and
  `stopPropagation()` run first and are respected.
- Events that do not bubble (`toggle`, `command`, `focus`, …) are handled in the capture
  phase and only match their target.

To find the element, CycleWire walks `event.composedPath()`, which also looks inside open
shadow roots. The **innermost** element bound to that event type wins, so a button inside a
clickable card runs the button's action only.

### The run pipeline

For each matched event, in order:

1. **Registered?** If not, CycleWire steps aside and the browser does what it would do
   anyway (a link navigates, a form submits).
2. **`cw:run`.** This event is cancelable. Cancel it and CycleWire steps aside.
3. **preventDefault.** Called only for bound submits, submit-button clicks, `href="#"` and
   `cw-prevent`, and decided synchronously, before any `await`. Modified clicks
   (Ctrl/Cmd/Shift, middle button) on prevented links are left alone, so "open in new
   tab" works.
4. **once, debounce, concurrency.** See [actions](actions.md#concurrency).
5. **Import, yield, run.** The handler gets `{ event, target, element, signal, props,
   action, wire }`.
6. **`cw:done` or `cw:error`.**

### Triggers

`cw-trigger` runs an action without an event: `load` (at start), `idle` (after the
window's load event, when the browser is idle), `visible` (when the element nears the
viewport) or `media:(query)` (when a media query matches).

Each element triggers once, even if it is moved. Triggers wait while the page is being
prerendered by speculation rules, so a prerendered page nobody opens does not fire idle
analytics.

### Preloading

`cw-preload` chooses when to fetch: `intent` (the default: pointer over, focus or
touch start), `visible`, `idle`, `load` or `none`. Screens that cannot hover give no
warning before a tap, so there the default also fetches an action's module once the page
is idle and its element nears the viewport. Speculative fetches are skipped under
Save-Data and on 2G connections.

## Compared with Qwik

CycleWire deliberately copies Qwik's loader, not its component model:

| | Qwik | CycleWire |
| --- | --- | --- |
| Listener | `qwikloader`, capture listeners on document/window | One listener per event type; bubble phase unless the event does not bubble |
| Binding in markup | `on:click` / `q-e:click` pointing at a generated `chunk#symbol` | `cw-action="cart#add"` (hand-written, registry-mapped) |
| Who writes it | The Qwik optimizer (compiler) | You, in any template language |
| Security boundary | Generated chunk URLs | An explicit registry: markup cannot name a URL |
| State | Serialized into a `qwik/json` script, resumed by the framework | Optional: `cw-state` / `cw-store` JSON, resumed lazily by [signals](signals.md) |
| Rendering | Components rendered on the client when state changes | None by default; `morph()` or `swap()` apply server HTML, and signals bindings update single nodes |
| Tooling | Required (optimizer, Vite plugin) | None: a script tag works |

## Why not a virtual DOM?

A virtual DOM needs the client to know how to render the component: the same code and
data that produced the server HTML. Running it on load to build the virtual tree is
hydration. CycleWire keeps the server as the only renderer and gives you tools for the
cases where the page has to change:

- **Server HTML changed?** [`morph()`](morph.md) updates the live DOM in place, keeping
  elements by id or key along with their focus, typed input, iframes and media.
- **Building markup on the client?** [`html`](dom.md) escapes by context and parses into
  an inert `<template>`. The resulting `DocumentFragment` goes into the page in one
  operation.
- **A number changed?** [Signals](signals.md) update exactly the text node or attribute
  that depends on it.
