# Integrations

CycleWire only reads attributes, so any template language works. These recipes cover
getting the attributes out of each one and registering actions.

## Laravel / Blade with Vite

```js
// resources/js/app.js
import { start, fromGlob } from 'cyclewire';

start({
    actions: fromGlob(import.meta.glob('./actions/**/*.js')),
});
```

```blade
<button cw-action="favorites.toggle" cw-props='@json(["type" => "firm", "id" => $firm->id])'>
    Favorite
</button>

<form action="{{ route('newsletter') }}" method="post" cw-action="newsletter">
    @csrf
    <input type="email" name="email" required>
    <button>Subscribe</button>
</form>
```

`@json` escapes quotes and `<`, `>`, `&`, so it is safe inside a single-quoted attribute.
The form above still posts normally if JavaScript never arrives.

The [`@cw` directive](server-helpers.md#php-and-laravel) writes the attributes for you,
escapes them and rejects a misspelt name or option:
`<button @cw('favorites.toggle', ['type' => 'firm', 'id' => $firm->id])>`.

A handler that posts to Laravel with the CSRF token:

```js
// resources/js/actions/newsletter.js
export async function run({ element, signal }) {
    const response = await fetch(element.action, {
        method: 'POST',
        body: new FormData(element),
        headers: { Accept: 'application/json' },
        signal,
    });
    element.replaceChildren(response.ok ? 'Thanks!' : 'Something went wrong.');
}
```

## Ruby on Rails

Rails turns `data: { cw_action: … }` into `cw-action`:

```erb
<%= button_tag "Add to cart", data: { cw_action: "cart#add", cw_props: { sku: product.sku }.to_json } %>
```

Stimulus uses `data-action` too. The default `cw-` prefix keeps the two apart, so they
can live on the same page.

In markup you write out, the [`cw` helper](server-helpers.md#ruby-on-rails) prints the
attributes, escaped: `<button <%= cw('cart#add', { sku: product.sku }) %>>`.

## Django

```django
{{ filters|json_script:"filters-state" }}
<form cw-state="#filters-state" cw-action="filters#apply">…</form>

<button cw-action="cart#add" cw-props='{"sku": "{{ product.sku|escapejs }}"}'>Add</button>
```

`json_script` pairs naturally with `cw-state="#id"` from [signals](signals.md).

The [`{% cw %}` tag](server-helpers.md#python-and-django) builds the JSON from a dictionary
in the context and escapes it: `<button {% cw 'cart#add' props %}>`.

## Plain PHP

```php
<button cw-action="cart#add"
        cw-props="<?= htmlspecialchars(json_encode(['sku' => $sku]), ENT_QUOTES) ?>">
    Add
</button>
```

[`cw.php`](server-helpers.md#php-and-laravel) does both in one call:
`<button <?= \CycleWire\cw('cart#add', ['sku' => $sku]) ?>>`.

## No build step at all

```html
<script type="importmap">
    { "imports": { "cyclewire": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.min.js",
                   "cyclewire/dom": "https://cdn.jsdelivr.net/npm/cyclewire@1/dist/dom.min.js" } }
</script>
<script type="module">
    import { start } from 'cyclewire';
    start({ actions: { cart: '/js/actions/cart.js' } });
</script>
```

Actions can then `import { html } from 'cyclewire/dom'` through the same import map.

## Astro

Astro renders HTML on the server and ships islands with `client:` directives. CycleWire
is a good fit for everything that is not an island: its triggers mirror `client:load`,
`client:idle`, `client:visible` and `client:media`, without shipping a component.

```astro
---
// src/layouts/Base.astro
---
<script>
    import { start, fromGlob } from 'cyclewire';
    start({ actions: fromGlob(import.meta.glob('../actions/**/*.js'), '../actions/') });
</script>
```

## Vite and webpack

- **Vite:** `fromGlob(import.meta.glob('./actions/**/*.js'))` gives every action its own
  chunk.
- **webpack:** write loader functions, `cart: () => import('./actions/cart.js')`, and
  webpack splits them.

Both bundlers pick the development build of CycleWire in dev mode through the
`development` export condition.

## React, Vue, Svelte, Solid

Use CycleWire for the server-rendered parts of the page and your framework inside its
islands. CycleWire can load the islands themselves (a `visible` trigger hydrates a
server-rendered component when it scrolls into view), and components can use CycleWire
actions:

- The attributes are valid in JSX and templates (`cw-action="…"`). In JSX, you can
  also spread [`cw()`](server-helpers.md#javascript-and-jsx): `<button {...cw('cart#add', { sku })}>`.
- CycleWire listens in the bubble phase, so your framework's handlers run first and its
  `stopPropagation()` is respected. `start({ capture: true })` flips that.
- CycleWire writes nothing into markup except `cw-pending` / `aria-busy` during a
  run, so hydration does not see foreign attributes on load.

[Frameworks](frameworks.md) has the recipes, and [examples/](../examples/README.md) has
runnable React, Vue and Svelte examples, tested in three browsers.

## SweetAlert2, Flatpickr, DataTables, jQuery and other libraries

Import a library in the action that uses it, and CycleWire loads it when it is needed:
Flatpickr on a field's first focus, DataTables when the table scrolls into view,
SweetAlert2 on the first submit. jQuery code keeps working next to CycleWire.
[Libraries](libraries.md) has the recipes and the caveats.

## htmx and Turbo

Both swap server HTML into the page. CycleWire's MutationObserver picks up triggers in
swapped-in content, and its document listeners survive Turbo Drive's body replacement.
When a swap removes an element, its running actions are aborted.

CycleWire can also make those requests itself: [`cyclewire/request`](request.md) has
htmx's attributes as an action, with a table from one to the other.

## Web Components

See [shadow DOM](shadow-dom.md).
