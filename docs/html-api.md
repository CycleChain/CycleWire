# HTML API

Attribute names below use the default prefix `cw-`. With `start({ prefix: 'x-' })` they
become `data-x-action` and so on. `prefix: ''` drops the prefix (`data-action`,
`data-trigger`, `data-once`, …); only do that when no other library on the page uses
those names (Stimulus uses `data-action`, for example). The attributes are plain `data-*`,
so they are valid HTML and pass through JSX, Blade, ERB, Twig, Jinja and friends
unchanged.

## Binding actions

### `data-cw-action="name"`

Runs `name` on the element's natural event:

| Element | Event |
| --- | --- |
| `<form>` | `submit` |
| `<input>` text-like (text, search, email, number, …), `<textarea>` | `input` |
| `<input>` checkbox, radio, file, range, color, date/time types; `<select>` | `change` |
| `<input type="button">`, `submit`, `reset`, `image` | `click` |
| `<details>` | `toggle` |
| everything else | `click` |

If the element also has `data-cw-trigger`, the action runs on the trigger only.

### `data-cw-on-<event>="name"`

Runs `name` on any delegated event type. An element can carry several of these, next to a
`data-cw-action`:

```html
<input data-cw-action="search" data-cw-on-keydown="search#keys" data-cw-on-focusin="search#open">
<dialog id="cart" data-cw-on-command="cart#command"></dialog>
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

### `data-cw-props='{…}'`

JSON parsed on first access and handed to the handler as `ctx.props`. Invalid JSON makes
the run fail with a `SyntaxError` naming the attribute.

```html
<button data-cw-action="cart#add" data-cw-props='{"sku": "wire-01", "qty": 1}'>Add</button>
```

Escape it for the attribute. In Blade, `data-cw-props='@json($props)'` is safe. Laravel's
`@json` escapes quotes, `<`, `>` and `&` by default.

## Activation without events

### `data-cw-trigger`

| Value | Runs |
| --- | --- |
| `load` | When CycleWire starts, or as soon as the element is added |
| `idle` | After the window's `load` event, in `requestIdleCallback` (Safari: shortly after load) |
| `visible` | When the element comes within `rootMargin` (120px) of the viewport |
| `media:(query)` | When the media query matches, now or later |

A trigger fires once per element, even when the element is moved. Triggers wait while
the page is prerendered by speculation rules.

## Loading

### `data-cw-preload`

| Value | Fetches the element's action modules |
| --- | --- |
| `intent` (default) | On `pointerover`, `focusin` or `pointerdown`. On screens that cannot hover, also once the page is idle and the element nears the viewport |
| `visible` | When the element nears the viewport |
| `idle` | When the browser is idle after load |
| `load` | At start |
| `none` | Never ahead of time |

Intent also fetches the modules of an element whose `visible` or `idle` preload has not
happened yet; only `none` turns it off. The look-ahead on screens that cannot hover
applies to elements with `data-cw-action` and no `data-cw-preload`; `start({ preload })`
changes it (see the [JavaScript API](js-api.md#startoptions)).

URL entries are fetched with `<link rel="modulepreload">`, which downloads and compiles
without running. Loader-function entries are imported, which runs the module's top level,
so keep action modules free of top-level side effects. Speculative preloads are skipped
under Save-Data and on 2G connections.

## Behaviour

### `data-cw-prevent`

CycleWire calls `preventDefault()` synchronously, before importing anything, for:
- a bound `submit`,
- a bound `click` on a submit button that belongs to a form,
- a bound `click` on `<a href="#">`,
- anything `data-cw-prevent` asks for:
  - `data-cw-prevent` (empty): every event type bound on the element.
  - `data-cw-prevent="click keydown"`: only those types.
  - `data-cw-prevent="none"`: never, not even the automatic cases above.

Links are otherwise never prevented. A prevented link still opens in a new tab on
Ctrl/Cmd/Shift-click or middle click, and the action does not run in that case.

### `data-cw-once`

The action runs until one run succeeds, then never again. A failed run can be retried.
Later events are still consumed and prevented, so a finished form never falls back to a
native submission.

### `data-cw-debounce="ms"`

Runs only after events pause for `ms` milliseconds. With `restart` (the default for
`input`), an in-flight run is aborted the moment a new event arrives.

### `data-cw-concurrency`

What happens when an event arrives while a run for the same element and action is in
flight:

| Mode | Default for | Behaviour |
| --- | --- | --- |
| `drop` | `click`, `submit`, `command`, triggers | Ignore the new event |
| `restart` | `input` | Abort the running one (its `signal` fires), start the new one |
| `latest` | `change`, `toggle` | Queue the newest event and run it when the current run ends |
| `parallel` | everything else | Start another run |

### `data-cw-ignore`

Nothing inside this element activates: event bindings (even on elements inside it),
`load` and `visible` triggers, preloads, and signals bindings. Events from inside it do
not reach an outer binding either. Put it around user-generated content so injected
`data-cw-*` attributes do nothing. See [security](security.md).

### Disabled elements

A bound element that is `:disabled` or has `aria-disabled="true"` swallows the event.
Its action does not run, and no ancestor's action runs either.

## Runtime state

### `data-cw-pending`

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
script. The full build also accepts `"signals": false` and `"bootstrap": true` (or
`{ "global": true }`).

## Module attributes

These belong to the optional modules and are documented with them:
- [signals](signals.md): `data-cw-state`, `data-cw-store`, `data-cw-bind`.
- [morph](morph.md): `data-cw-key`, `data-cw-preserve`.
