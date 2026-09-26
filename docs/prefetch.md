# Prefetch: `cyclewire/prefetch`

Data fetched on intent, next to the action's code. 0.5 kB brotli.

```html
<a href="/products/42" cw-action="quickview" cw-prefetch="/api/products/42">Quick view</a>
```

```js
import { start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';

start({ actions, plugins: [prefetch()] });
```

```js
// actions/quickview.js
export async function run({ element, fetch, signal }) {
    const response = await fetch(element.getAttribute('cw-prefetch'), { signal });
    const product = await response.json();
    // …
}
```

When the pointer reaches an element that binds an action, focus moves to it or a finger
lands on it, the plugin starts a GET of its `cw-prefetch` URL, while CycleWire fetches
the action's module. The handler's `ctx.fetch` works like `fetch()`, except that a plain
GET of that URL takes the response already on its way, once. The code and the data then
arrive together instead of one after the other.

## Rules

- **Only the page's own origin.** Markup never makes the browser ask another site for
  anything; a `cw-prefetch` elsewhere is ignored.
- **Only GET, only once.** `ctx.fetch` takes a prefetched response for a request with no
  method, headers or body (a `signal` is fine), and only once: the next call fetches
  again. A response waits ten seconds at most, then it is dropped as stale.
- **Opting out stops it too.** Nothing inside `cw-ignore` is prefetched, and neither is
  anything on an element with `cw-preload="none"`, nor when the visitor asked to save
  data.
- **A failed prefetch costs nothing.** `ctx.fetch` then asks again, and reports what that
  request returns.

Only name URLs that are safe to fetch early: a GET must not change anything on the
server, as HTTP intends.

## API

- `prefetch()`: the plugin.
- `fetchAhead(input, init?)`: what `ctx.fetch` is, for code outside a handler.

The plugin uses the `intent` hook every plugin can use: see
[writing a plugin](plugins.md#writing-a-plugin). The full classic-script build installs it.
