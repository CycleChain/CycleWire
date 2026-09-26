# HTML API

Attribute names below use the default prefix `cw-`, as in `cw-action`: short to write,
like htmx's `hx-*` or Alpine's `x-*`, and passed through unchanged by JSX, Blade, ERB,
Twig, Jinja and friends. The prefix is yours to choose with `start({ prefix })`:

| `prefix` | Names | |
| --- | --- | --- |
| `'cw-'` (default) | `cw-action`, `cw-props`, … | |
| `'data-cw-'` | `data-cw-action`, `data-cw-props`, … | Names HTML validators accept |
| `'x-'` | `x-action`, `x-props`, … | Your own namespace |
| `''` | `data-action`, `data-props`, … | Only when no other library on the page uses those names (Stimulus uses `data-action`) |

An empty prefix means `data-`, since a bare `action` is already a form attribute. The
server helpers, `cyclewire check` and the Vite plugin take the same `prefix`.

## Binding actions

### `cw-action="name"`

Runs `name` on the element's natural event:

| Element | Event |
| --- | --- |
| `<form>` | `submit` |
| `<input>` text-like (text, search, email, number, …), `<textarea>` | `input` |
| `<input>` checkbox, radio, file, range, color, date/time types; `<select>` | `change` |
| `<input type="button">`, `submit`, `reset`, `image` | `click` |
| `<details>` | `toggle` |
| everything else | `click` |

If the element also has `cw-trigger`, the action runs on the trigger only.

### `cw-on-<event>="name"`

Runs `name` on any delegated event type. An element can carry several of these, next to a
`cw-action`:

```html
<input cw-action="search" cw-on-keydown="search#keys" cw-on-focusin="search#open">
<dialog id="cart" cw-on-command="cart#command"></dialog>
<button commandfor="cart" command="--refresh">Refresh</button>
```

Delegated by default: `click`, `submit`, `input`, `change`, `keydown`, `keyup`,
`focusin`, `focusout`, `pointerdown`, `toggle`, `command`. Add more with
[`listen()`](js-api.md#listentypes-options). Attribute names are lowercase, so event names
must be too.

### Names

- `module`: calls the module's `run` export, or its default export.
- `module#export`: calls a named export.

Module names may contain letters, digits, `_`, `-` and `.`, and must be
[registered](js-api.md#registeractions).

## Data

### `cw-props='{…}'`

JSON parsed on first access and handed to the handler as `ctx.props`. Invalid JSON makes
the run fail with a `SyntaxError` naming the attribute.

```html
<button cw-action="cart#add" cw-props='{"sku": "wire-01", "qty": 1}'>Add</button>
```

Escape it for the attribute. In Blade, `cw-props='@json($props)'` is safe. Laravel's
`@json` escapes quotes, `<`, `>` and `&` by default. The [server helpers](server-helpers.md)
write and escape it in PHP, Ruby, Python and JavaScript.

## Activation without events

### `cw-trigger`

| Value | Runs |
| --- | --- |
| `load` | When CycleWire starts, or as soon as the element is added |
| `idle` | After the window's `load` event, in `requestIdleCallback` (Safari: shortly after load) |
| `visible` | When the element comes within `rootMargin` (120px) of the viewport |
| `media:(query)` | When the media query matches, now or later |

A trigger fires once per element, even when the element is moved. Triggers wait while
the page is prerendered by speculation rules.

## Loading

### `cw-preload`

| Value | Fetches the element's action modules |
| --- | --- |
| `intent` (default) | On `pointerover`, `focusin` or `pointerdown`. On screens that cannot hover, also once the page is idle and the element nears the viewport |
| `visible` | When the element nears the viewport |
| `idle` | When the browser is idle after load |
| `load` | At start |
| `none` | Never ahead of time |

Intent also fetches the modules of an element whose `visible` or `idle` preload has not
happened yet; only `none` turns it off. The look-ahead on screens that cannot hover
applies to elements with `cw-action` and no `cw-preload`; `start({ preload })`
changes it (see the [JavaScript API](js-api.md#startoptions)).

URL entries are fetched with `<link rel="modulepreload">`, which downloads and compiles
without running. Loader-function entries are imported, which runs the module's top level,
so keep action modules free of top-level side effects. Speculative preloads are skipped
under Save-Data and on 2G connections.

## Behaviour

### `cw-prevent`

CycleWire calls `preventDefault()` synchronously, before importing anything, for:
- a bound `submit`,
- a bound `click` on a submit button that belongs to a form,
- a bound `click` on `<a href="#">`,
- anything `cw-prevent` asks for:
  - `cw-prevent` (empty): every event type bound on the element.
  - `cw-prevent="click keydown"`: only those types.
  - `cw-prevent="none"`: never, not even the automatic cases above.

Links are otherwise never prevented. A prevented link still opens in a new tab on
Ctrl/Cmd/Shift-click or middle click, and the action does not run in that case.

### `cw-once`

The action runs until one run succeeds, then never again. A failed run can be retried.
Later events are still consumed and prevented, so a finished form never falls back to a
native submission.

### `cw-debounce="ms"`

Runs only after events pause for `ms` milliseconds. With `restart` (the default for
`input`), an in-flight run is aborted the moment a new event arrives.

### `cw-concurrency`

What happens when an event arrives while a run for the same element and action is in
flight:

| Mode | Default for | Behaviour |
| --- | --- | --- |
| `drop` | `click`, `submit`, `command`, triggers | Ignore the new event |
| `restart` | `input` | Abort the running one (its `signal` fires), start the new one |
| `latest` | `change`, `toggle` | Queue the newest event and run it when the current run ends |
| `parallel` | everything else | Start another run |

### `cw-ignore`

Nothing inside this element activates: event bindings (even on elements inside it),
`load` and `visible` triggers, preloads, and signals bindings. Events from inside it do
not reach an outer binding either. Put it around user-generated content so injected
`cw-*` attributes do nothing. See [security](security.md).

### Disabled elements

A bound element that is `:disabled` or has `aria-disabled="true"` swallows the event.
Its action does not run, and no ancestor's action runs either.

## Runtime state

### `cw-pending`

Present while a run is in flight. For `drop` runs (clicks, submits) `aria-busy="true"` is
set too. Both are reference counted, and whatever values the server rendered are put back
afterwards. CycleWire never sets `disabled`, because that would throw focus to `<body>`.

## Configuration block

```html
<script type="application/json" data-cyclewire>
    {
        "prefix": "cw-",
        "actions": { "cart": "/js/actions/cart.js" },
        "rootMargin": "200px",
        "idleTimeout": 3000,
        "shadow": true
    }
</script>
```

Read by `cyclewire/auto` and the classic-script builds. Place it before the CycleWire
script. The full build also accepts `"signals": false`, `"bootstrap": true` (or
`{ "global": true }`) and `"streams": { "channels": { … } }`.

## Module attributes

These belong to the optional modules and are documented with them:
- [signals](signals.md): `cw-state`, `cw-store`, `cw-bind`.
- [morph](morph.md): `cw-key`, `cw-preserve`.
- [stream](stream.md): `cw-stream`, and the `cw-stream-state` it sets.
- [prefetch](prefetch.md): `cw-prefetch`, a URL fetched on intent.
