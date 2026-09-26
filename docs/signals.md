# cyclewire/signals

Fine-grained reactivity that **resumes from state the server serialized into the
page** instead of re-rendering it. 3.1 kB brotli.

```js
import { start } from 'cyclewire';
import { signals } from 'cyclewire/signals';

start({ actions, plugins: [signals()] });
```

## Resumable state in markup

```html
<section cw-state='{"count": 2, "open": false}'>
    <output cw-bind="text: count">2</output>
    <button cw-action="counter#inc">+1</button>
    <button cw-action="counter#toggle" cw-bind="attr.aria-expanded: open">Details</button>
    <div cw-bind="show: open" hidden>…</div>
</section>
```

```js
// actions/counter.js
export function inc({ state }) { state.count++; }
export function toggle({ state }) { state.open = !state.open; }
```

**Nothing runs on page load.** The server already rendered `2`, and `hidden`, and
`aria-expanded="false"`, so there is nothing to do. A scope's JSON is parsed, and its
bindings wired, the first time something touches it:
- an action reads `ctx.state`,
- the user types into a two-way bound control,
- your code calls `stateOf()` or `store()`.

A page with a hundred widgets pays only for the ones people use.

### `cw-state`

Defines a **scope** for the element's subtree. The value is JSON, or `#id` of a
`<script type="application/json">`:

```html
<script type="application/json" id="filters-state">{"query": "", "tags": []}</script>
<form cw-state="#filters-state">…</form>
```

Scopes nest. An element binds to its nearest scope, and scopes do not cross shadow root
boundaries.

### `cw-store`

A **named store**, shared by the whole page and reachable from inside shadow roots:

```html
<script type="application/json" cw-store="cart">{"items": []}</script>

<header><span cw-bind="text: $cart.count">0</span> items</header>
<button cw-action="cart#add" cw-props='{"sku": "w1", "price": 12}'>Add</button>
```

```js
// actions/cart.js
export function add({ store, props }) {
    const cart = store('cart', {
        get count() { return this.items.length; },
        get total() { return this.items.reduce((sum, item) => sum + item.price, 0); },
    });
    cart.items.push(props);
}
```

`store(name, init)` seeds the store from the JSON script on first use. `init` adds
defaults and getters: JSON from the server wins over plain defaults, and getters, which
are derived values, are always installed.

## Bindings

`cw-bind="directive: expression; directive: expression"`:

| Directive | Effect |
| --- | --- |
| `text: path` | `textContent` |
| `value: path` | A control's value. **Two-way:** text and number inputs update on `input` (numbers arrive as numbers); selects and radios on `change`. Radios check themselves when the value matches theirs |
| `checked: path` | A checkbox's checked state. **Two-way** |
| `show: path` / `hide: path` | Toggle the `hidden` attribute |
| `class.<name>: path` | Toggle a class |
| `attr.<name>: path` | Set an attribute. `false`/`null` removes it, `true` sets it empty, and `aria-*` get `"true"`/`"false"`. State is data, never code: event handlers (`on*`), `srcdoc` and `javascript:` URLs are refused |
| `style.<property>: path` | Set a CSS property (kebab-case, custom properties welcome) |

Expressions are deliberately minimal: a dotted path (`user.name`, `items.length`), an
optional `!` to negate, and `$store.path` for named stores. There is no `eval`, so
bindings work under strict CSP. Anything more complex belongs in a getter or `computed`.

When a binding runs for the first time and the DOM already shows the right value,
nothing is written. When a bound element leaves the page, its binding stops.

## In actions

With the plugin installed, every action context gets:
- `ctx.state`: the element's scope, created on first access.
- `ctx.store(name, init?)`: a named store.

Without the plugin, import `stateOf(element)` and `store(name)` directly.

## Signals

The primitives underneath work on their own, too:

```js
import { signal, computed, effect, batch, untracked } from 'cyclewire/signals';

const count = signal(0);
const double = computed(() => count.value * 2);
const stop = effect(() => console.log(double.value)); // logs 0

batch(() => {
    count.value = 1;
    count.value = 2;
}); // logs 4, once
stop();
```

- **Glitch-free.** Effects run once per batch and never see a half-updated graph.
- **Lazy.** `computed` values evaluate on demand and only notify when their value
  actually changes.
- `effect` may return a cleanup function. It runs before the next run and on dispose.
- `signal.peek()` reads without subscribing; `signal.subscribe(fn)` is an effect over one
  signal.
- An effect that keeps re-triggering itself is stopped with an error instead of hanging
  the page.

## `reactive(object)`

A deeply reactive proxy over plain objects and arrays. It powers scopes and stores:

```js
const state = reactive({ todos: [] });
effect(() => render(state.todos));
state.todos.push({ title: 'Ship it' }); // one update, even for splice
```

Reads inside effects subscribe per property. `push`, `splice` and friends notify once
per call, and adding or deleting keys notifies anyone iterating. `toRaw(proxy)` returns
the plain object.

## Several copies on one page

If the module loads twice, for example from a CDN and from your bundle, both copies use
the first one's implementation, so there is only ever one reactive graph.

## Lists

There is no declarative list directive yet; it is on the roadmap. Render lists with an
effect and [`swap`](dom.md) or [`morph`](morph.md):

```js
effect(() => swap(list, html`${state.todos.map((todo) => html`<li>${todo.title}</li>`)}`));
```
