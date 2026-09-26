# JavaScript API

```js
import { start, stop, register, listen, scan, observe, run, preload, loaded, use, fromGlob, version } from 'cyclewire';
```

The classic-script builds expose the same functions on `window.CycleWire`. Every function
is also available to actions as `ctx.wire`.

## `start(options?)`

Attaches the delegated listeners, activates triggers and starts watching for content.
Returns the API. Calling it again only registers the `actions` you pass.

| Option | Default | |
| --- | --- | --- |
| `actions` | – | Registry entries, see [`register`](#registeractions) |
| `prefix` | `'cw-'` | Attribute prefix; `''` leaves the attributes unprefixed |
| `events` | – | Extra event types to delegate |
| `capture` | `false` | Delegate every event in the capture phase, before your own handlers (useful when an island calls `stopPropagation()` on everything) |
| `rootMargin` | `'120px'` | IntersectionObserver margin for `visible` |
| `idleTimeout` | `2000` | `requestIdleCallback` timeout for `idle`, in ms |
| `mutations` | `true` | Watch for added and removed content with a MutationObserver |
| `shadow` | `false` | Observe the open shadow roots found while scanning (declarative shadow DOM) |
| `preload` | `'auto'` | What else fetches the modules of elements without `data-cw-preload`. `'auto'`: on screens that cannot hover (`(hover: none)`), the element nearing the viewport once the page is idle; `'visible'`: the same on every screen; `'intent'`: nothing but intent |
| `onError` | `console.error` | `(error, { action, element, event }) => void` for failed runs |
| `plugins` | – | Plugins to install, e.g. `[signals()]` |

If another copy of CycleWire already started on the page (say a CDN copy next to a
bundled one), `start()` warns and defers to it instead of delegating every event twice.

## `stop()`

Removes every listener and observer, aborts running actions and cancels scheduled
triggers. A later `start()` activates the page afresh.

## `register(actions)`

```js
register({
    cart: () => import('./actions/cart.js'), // loader function: bundler code splitting
    map: '/js/actions/map.js',               // URL, resolved against document.baseURI
    chart: 'app/chart',                      // bare specifier, resolved by the page's import map
    datepicker: {                            // an object: the module, plus options for plugins
        module: '/js/actions/datepicker.js',
        css: ['/css/vendor/flatpickr.css'],  // read by styles() from cyclewire/css
    },
});
```

An object entry names its module in `module`; its other fields are options for plugins.
With the `styles()` plugin of [`cyclewire/css`](css.md), `css` lists stylesheets that are
preloaded with the module and applied before the handler runs.

Registering a name again replaces it and forgets its cached module. Triggers waiting for
a name run as soon as it is registered. Names may contain letters, digits, `_`, `-` and
`.`.

A module that fails to load is forgotten, and the next interaction imports it again.
Browsers remember failed module URLs, so URL entries are retried with a `cw-retry` query
parameter.

## `listen(types, options?)`

```js
listen(['dblclick', 'contextmenu']);
listen(['pointermove'], { passive: true });
```

Delegates more event types on every observed root. Listeners are passive for
high-frequency events that cannot be cancelled usefully (`pointermove`, `touchmove`,
`wheel`, `scroll`, …). Override with `{ capture, passive }`.

## `scan(root = document)`

Activates the triggers and scheduled preloads in `root`, including `root` itself. You
only need it when you started with `mutations: false`; otherwise added content is
scanned automatically.

## `observe(root)`

```js
class CartWidget extends HTMLElement {
    connectedCallback() {
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = '<form data-cw-action="cart#checkout">…</form>';
        this.release = observe(root);
    }
    disconnectedCallback() {
        this.release();
    }
}
```

Delegates events inside a shadow root, including the ones that do not cross its boundary
(`submit`, `change`, `toggle`, `command`), and activates and watches its triggers.
Returns a function that undoes it. See [shadow DOM](shadow-dom.md).

## `run(action, element?, event?)`

```js
const result = await run('cart#add', button);
```

Runs an action programmatically, through the same once, debounce and concurrency rules
as a delegated event, so the default mode is `drop`. Resolves to the handler's return
value, or `undefined` when the run was dropped, superseded or cancelled. Rejects if the
action is not registered or the handler throws. `element` defaults to
`document.documentElement`.

## `preload(action)`

Fetches an action's module ahead of use, even under Save-Data. Returns a promise that
settles when the fetch has finished; it never rejects.

## `loaded()`

Names of the action modules imported so far. It is `[]` until the user reaches for
something, which makes it a handy assertion in tests and a quick check in the console.

## `use(plugin)`

Adds a plugin. A plugin is a plain object:

```js
{
    setup({ prefix, wire }) {},     // once, when added
    context(ctx) {},                // add fields to every action context
    scan(root) {},                  // see every subtree CycleWire scans
    preload(entry, name) {},        // an action is being preloaded: fetch what else it needs
    load(entry, element, name) {},  // an action is about to run: return a promise the handler waits for
    stop() {},
}
```

See [plugins](plugins.md).

## `fromGlob(modules, base = './actions/')`

```js
start({ actions: fromGlob(import.meta.glob('./actions/**/*.js')) });
// ./actions/cart.js → "cart", ./actions/cart/add.js → "cart.add", ./actions/menu/index.js → "menu"
```

Turns a path → loader map into action names by stripping `base` and the extension and
turning `/` into `.`.

## `version`

The package version, e.g. `"1.0.0"`.

## Lifecycle events

Dispatched on the bound element. They bubble and cross shadow boundaries.

| Event | `detail` | Cancelable |
| --- | --- | --- |
| `cw:run` | `{ action, event }` | Yes. Cancelling it makes CycleWire step aside, and the browser default happens |
| `cw:done` | `{ action, result }` | No |
| `cw:error` | `{ action, error }` | No |

```js
document.addEventListener('cw:done', ({ detail }) => analytics.track(detail.action));
```

An element removed from the page cannot bubble events to the document, so use `onError`
to catch every failure.

## TypeScript

Types ship with the package:

```ts
import type { ActionMap, Context, Options, Plugin } from 'cyclewire';

export async function run({ element, props, signal }: Context) {
    // …
}
```
