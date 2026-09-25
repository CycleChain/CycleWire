# Actions

An action is a function in an ES module. CycleWire imports the module the first time
the action is needed and calls the function with one context object.

```js
// actions/cart.js
export async function add({ element, props, signal }) {
    const response = await fetch('/cart', { method: 'POST', body: JSON.stringify(props), signal });
    element.querySelector('.count').textContent = (await response.json()).count;
}

export default function run(ctx) { /* used for data-cw-action="cart" */ }
```

- `data-cw-action="cart#add"` calls the `add` export.
- `data-cw-action="cart"` calls `run`, falling back to the default export.

## The context

| Field | |
| --- | --- |
| `event` | The event that triggered the run; `null` for triggers and `run()` |
| `target` | The innermost event target, captured while the event was dispatched. `event.target` is `null` for shadow DOM events by the time your code runs |
| `element` | The element carrying the binding |
| `signal` | An `AbortSignal` that fires when a newer run supersedes this one, when the element leaves the page, or on `stop()` |
| `props` | Parsed `data-cw-props`, or `null` |
| `action` | The name that ran, e.g. `"cart#add"` |
| `wire` | The CycleWire API (`run`, `preload`, `observe`, …) |
| `state`, `store` | Added by the [signals](signals.md) plugin |

## Your code runs after dispatch

The first run of an action waits for its module to download. Even when the module is
cached, CycleWire yields before calling you so the browser can paint the pressed state.
Either way, your handler runs **after** the event has finished dispatching, which means:

- `event.preventDefault()` in a handler does nothing. Use
  [`data-cw-prevent`](html-api.md#data-cw-prevent), which is applied synchronously.
- APIs that need a user gesture, such as `navigator.clipboard.writeText`, `window.open`
  and `navigator.share`, may be refused after a slow first import, and Safari is the
  strictest. Preload the module (`data-cw-preload="load"`) or use the upgrade pattern
  below.
- `event.currentTarget` is `null`. Use `element`.

### The upgrade pattern

For things that must happen synchronously on every interaction, attach a direct listener
the first time the action runs and tie it to the signal:

```js
// actions/copy.js
export function run({ element, signal }) {
    const copy = () => navigator.clipboard.writeText(element.dataset.text);
    copy(); // this first click: works in Chromium and Firefox, may be refused in Safari
    element.addEventListener('click', copy, { signal }); // later clicks: synchronous
}
```

Pair it with `data-cw-once` so CycleWire stops handling the element after the first
successful run:

```html
<button data-cw-action="copy" data-cw-once data-cw-preload="load" data-text="npm i cyclewire">Copy</button>
```

## Concurrency

What happens when an event arrives while a run for the same element and action is still
going depends on the concurrency mode:

| Mode | Default for | What happens | Typical use |
| --- | --- | --- | --- |
| `drop` | `click`, `submit`, `command`, triggers | The new event is ignored | Buttons, forms: no double submits |
| `restart` | `input` | The running call's `signal` aborts, the new call starts | Search-as-you-type |
| `latest` | `change`, `toggle` | The newest event waits and runs once the current run ends | Checkboxes that save: the server ends up with the last value |
| `parallel` | other events | Every event starts its own run | Independent, idempotent work |

```html
<input type="search" data-cw-action="search" data-cw-debounce="200">
<input type="checkbox" data-cw-action="settings#save">
<button data-cw-action="toast" data-cw-concurrency="parallel">Notify</button>
```

Pass `signal` to everything that supports it, so superseded work actually stops:

```js
export async function run({ element, signal }) {
    const response = await fetch(`/search?q=${encodeURIComponent(element.value)}`, { signal });
    render(await response.json());
}
```

Every new run for a binding also aborts the previous run's signal, even one that has
finished. Listeners you registered with `{ signal }` in the last run are released that
way.

## Once, debounce

- `data-cw-once` keeps the element working until one run succeeds. After that, events
  are consumed and still prevented.
- `data-cw-debounce="ms"` waits for a pause. Under `restart`, a new event aborts the
  in-flight run immediately rather than when the pause ends.

## Pending state

While a run is in flight, the element has `data-cw-pending`. `drop` runs also set
`aria-busy="true"`. Style them and let assistive technology know:

```css
[data-cw-pending] { opacity: .6; pointer-events: none; }
```

## Results and errors

- A handler's return value (or its promise's value) is dispatched as `cw:done`, with
  `detail.result`.
- A thrown error is dispatched as `cw:error`, and passed to `onError` (or logged).
- Aborts triggered by CycleWire itself are not errors: an `AbortError` from your own
  `signal` is swallowed.

```js
start({
    actions,
    onError(error, { action, element }) {
        reportError(error, { action, element: element.id });
        element.setAttribute('data-failed', '');
    },
});
```

## Styles for the UI an action creates

If an action builds UI that needs its own stylesheet (a date picker, an editor, a map),
load it with [`cyclewire/css`](css.md). Either register the CSS with the action,
`{ module: '/js/actions/datepicker.js', css: '/css/flatpickr.css' }` with the `styles()`
plugin, so it is fetched along with the module and applied before your handler runs; or
`await css(href, element)` at the top of the handler. Either way the UI never appears
unstyled.

## Rules of thumb

- **No top-level side effects in action modules.** Preloading may import a module before
  anyone clicks.
- **Keep exports intentional.** `module#export` makes every function a module exports
  callable from markup.
- **Make it work without JavaScript first.** Links link and forms submit. An action that
  fails to load leaves the browser's default in place, because CycleWire only prevents
  once it knows the action exists.
- **Use real buttons.** Clickable `<div>`s cannot be focused or used from a keyboard; the
  development build warns about them. On iOS Safari, delegated clicks on non-interactive
  elements also need `cursor: pointer`.
