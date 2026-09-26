# Core first, modules when you need them

CycleWire is split so a page pays only for what it uses. The core handles activation on
its own. The optional modules add stylesheets on demand, client-side rendering, morphing,
reactive state and Bootstrap support, and each can be added on its own. Better still, you
can import a module from the action that needs it, so it downloads the first time that
action runs.

| Import | Adds | brotli |
| --- | --- | --- |
| `cyclewire` | Activation: everything in the next section | 4.8 kB |
| `cyclewire/css` | Stylesheets that arrive with the actions that need them | 0.6 kB |
| `cyclewire/dom` | Safe `html` templates, inert fragments, `swap`, `transition` | 2.2 kB |
| `cyclewire/morph` | Morphing to new server HTML while keeping focus and input | 1.8 kB |
| `cyclewire/signals` | Signals, reactive stores, `cw-bind` resumed from server JSON | 3.1 kB |
| `cyclewire/stream` | Server-sent HTML messages that change the page, over Server-Sent Events or in responses | 3.3 kB |
| `cyclewire/bootstrap` | Bootstrap 5's data API without its JavaScript | 2.1 kB |

## What the core does on its own

Everything below uses only `cyclewire`.

| You want | Use |
| --- | --- |
| Run code on click, submit, input, change, … | `cw-action`, `cw-on-<event>` |
| Pass server data to it | `cw-props='{…}'` |
| Wake a widget when it scrolls into view, when idle, or at a breakpoint | `cw-trigger="visible"`, `idle`, `media:(…)` |
| Fetch code before the click | `cw-preload` (intent by default) |
| No double submits, no stale search results | `cw-concurrency`, `cw-debounce`, `ctx.signal` |
| Components with shadow DOM | `observe(shadowRoot)`, `start({ shadow: true })` |
| Analytics and error reporting | `cw:run`, `cw:done`, `cw:error`, `onError` |

### A toggle

```html
<button cw-action="favorite" cw-props='{"id": 42}' aria-pressed="false">☆ Save</button>
```

```js
// actions/favorite.js
export async function run({ element, props, signal }) {
    const response = await fetch(`/api/favorites/${props.id}`, { method: 'POST', signal });
    const { saved } = await response.json();
    element.setAttribute('aria-pressed', String(saved));
    element.textContent = saved ? '★ Saved' : '☆ Save';
}
```

### A form that submits without a reload, and still works without JavaScript

```html
<form action="/newsletter" method="post" cw-action="newsletter">
    <input type="email" name="email" required>
    <button>Subscribe</button>
</form>
```

```js
// actions/newsletter.js
export async function run({ element, signal }) {
    const response = await fetch(element.action, { method: 'POST', body: new FormData(element), signal });
    element.replaceChildren(response.ok ? 'Thanks!' : 'Please try again.');
}
```

### Search as you type

Input runs in `restart` mode, so each keystroke aborts the previous request. Build the
results with DOM APIs, or add [`cyclewire/dom`](dom.md) when markup gets richer.

```html
<input type="search" cw-action="search" cw-debounce="150">
<ul id="results"></ul>
```

```js
// actions/search.js
export async function run({ element, signal }) {
    const response = await fetch(`/search?q=${encodeURIComponent(element.value)}`, { signal });
    const items = (await response.json()).map((hit) => {
        const li = document.createElement('li');
        li.textContent = hit.title;
        return li;
    });
    document.getElementById('results').replaceChildren(...items);
}
```

### A widget that wakes up when it scrolls into view

```html
<div cw-action="map" cw-trigger="visible" cw-props='{"lat": 41.0, "lng": 29.0}' style="aspect-ratio: 16 / 9">
    <img src="/static/map-preview.png" alt="Map of our office">
</div>
```

The module is fetched as the element approaches the viewport, and the server-rendered
preview stays until the handler replaces it. If the map needs its own stylesheet, add
[`cyclewire/css`](css.md).

### Analytics once the page is idle

```html
<div cw-action="analytics#pageview" cw-trigger="idle"></div>
```

### A dialog with no JavaScript, plus a custom command

The platform opens the dialog. CycleWire only handles the custom `--refresh` command.

```html
<button commandfor="cart" command="show-modal">Cart</button>
<button commandfor="cart" command="--refresh">Refresh</button>
<dialog id="cart" cw-on-command="cart#command">…</dialog>
```

```js
// actions/cart.js
export function command({ event }) {
    if (event.command === '--refresh') { /* … */ }
}
```

### Behaviour for one breakpoint

```html
<nav cw-action="menu#compact" cw-trigger="media:(max-width: 40em)"></nav>
```

## When to add a module

| You need | Add |
| --- | --- |
| A widget whose UI needs its own stylesheet (date picker, editor, map), loaded with its action | [`cyclewire/css`](css.md) |
| Markup built on the client (result lists, rows, cards) with escaping you cannot get wrong | [`cyclewire/dom`](dom.md) |
| A region refreshed from server HTML while keeping focus, typed input, iframes and media | [`cyclewire/morph`](morph.md), with `html.raw()` from `dom` |
| Several places on the page reflecting the same state (cart badge, counters), or inputs bound to state | [`cyclewire/signals`](signals.md) |
| Bootstrap 5 components on a site that should not ship Bootstrap's JavaScript | [`cyclewire/bootstrap`](plugins.md) |

If none of these apply, stay on the core.

## How to add one

### Import it from the action that needs it

This is the pattern to reach for first. An optional module imported only inside action
modules is downloaded with the first action that uses it. Pages and visitors that never
trigger that action never pay for it.

```js
// actions/refresh.js: cyclewire/dom and cyclewire/morph arrive with this action.
import { html } from 'cyclewire/dom';
import { morph } from 'cyclewire/morph';

export async function run({ element, signal }) {
    const response = await fetch(element.dataset.url, { signal });
    await morph(document.querySelector(element.dataset.target), html.raw(await response.text()));
}
```

With a bundler this happens automatically: the bundler puts `dom` and `morph` into the
action's chunk, or into a chunk shared by the actions that import them. Without one, use
an import map so bare imports resolve:

```html
<script type="importmap">
    {
        "imports": {
            "cyclewire": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.min.js",
            "cyclewire/css": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/css.min.js",
            "cyclewire/dom": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/dom.min.js",
            "cyclewire/morph": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/morph.min.js",
            "cyclewire/signals": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/signals.min.js"
        }
    }
</script>
<script type="module">
    import { start } from 'cyclewire';
    start({ actions: { refresh: '/js/actions/refresh.js' } });
</script>
```

The [landing page](https://cyclechain.github.io/CycleWire/) works this way. It boots with
the core alone, and its demos pull in `css`, `dom`, `morph` and `signals` as they are used.

### Install a plugin at start

Three modules have a plugin for features that must exist before any action runs:
- `styles()` preloads the stylesheets listed in `{ module, css }` entries with their
  modules, and applies them before the handler runs.
- `signals()` adds two-way bindings, `ctx.state` / `ctx.store`, and binding of content
  added later.
- `bootstrap()` handles `data-bs-*` clicks.

These are imported by your entry file and load with it:

```js
import { start } from 'cyclewire';
import { styles } from 'cyclewire/css';
import { signals } from 'cyclewire/signals';
import { bootstrap } from 'cyclewire/bootstrap';

start({ actions, plugins: [styles(), signals(), bootstrap({ global: true })] });
```

Signals also works without its plugin. Actions call `store()` and `stateOf()` directly,
and bindings wake up when a store or scope is first touched. Install the plugin only if
you need two-way inputs.

### One script with everything

For prototypes and small sites, `cyclewire.full.global.min.js` (14.0 kB) bundles every
module into one classic script:
- It exposes `CycleWire.css`, `CycleWire.dom`, `CycleWire.morph`, `CycleWire.signals` and
  `CycleWire.bootstrap`.
- The styles plugin is installed, so `{ "module": …, "css": … }` entries work.
- The signals plugin is installed unless the config says `"signals": false`.
- The Bootstrap plugin is installed only when the config asks for it with
  `"bootstrap": true`.

```html
<script type="application/json" data-cyclewire>{ "actions": { "cart": "/js/actions/cart.js" } }</script>
<script src="https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.full.global.min.js" defer></script>
```

The trade-off: every module is downloaded up front, whether the page uses it or not.

## Combinations that work well

- **HTML over the wire, `dom` + `morph`:** actions fetch server-rendered partials and
  morph them in. The server stays the only renderer.
- **Resumable state, `signals`:** the server serializes a store as JSON, and the actions
  change it. Badges, totals and counters update wherever they are bound.
- **Client-rendered lists, `signals` + `dom`:** an `effect()` renders a list from
  reactive state with `html` and `swap`.
- **Bootstrap site, `bootstrap` + core actions:** Bootstrap's components work without
  Bootstrap's JavaScript, and your own actions sit next to them.
