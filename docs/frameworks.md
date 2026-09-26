# React, Vue, Svelte and other frameworks

CycleWire does not replace your component framework. The server renders the page,
CycleWire activates it, and a framework runs only inside the islands that need one. The
two fit together in two ways, and one page can use both:

- **CycleWire loads your islands.** A trigger decides when an island's framework and
  component download and hydrate: when it scrolls into view, when the browser is idle, at
  a breakpoint. Pages and visitors that never reach an island never download the
  framework.
- **Components use CycleWire actions.** A `cw-action` inside JSX or a template works
  as it does anywhere else. Server-driven behaviour (save, delete, load a partial) stays
  in plain action modules that server-rendered pages and components share.

Runnable examples: [React](../examples/react/), [Vue](../examples/vue/) and
[Svelte](../examples/svelte/), also [live](https://cyclechain.github.io/CycleWire/examples/).
The browser tests run each of them in Chromium, Firefox and WebKit
([`frameworks.spec.js`](../test/e2e/frameworks.spec.js)), covering server rendering, lazy
loading, hydration without mismatches, actions inside components and unmounting. See
[examples/README.md](../examples/README.md) to run them.

## Load an island with CycleWire

The island's element carries the action, the trigger and the props. Its content is the
component, rendered on the server with the same props:

```html
<div cw-action="islands#counter" cw-trigger="visible" cw-props='{"start": 3}'>
    <!-- <Counter start={3} />, rendered on the server -->
</div>
```

Register the islands module with a loader function, so your bundler puts it, the
framework and the components into a chunk of their own:

```js
import { start } from 'cyclewire';

start({
    actions: {
        islands: () => import('./actions/islands.jsx'),
    },
});
```

With Vite, `fromGlob(import.meta.glob('./actions/**/*.{js,jsx}'))` registers every action
module this way.

The islands module mounts the component. Hydrate what the server rendered, or mount into
an empty element when it did not:

**React**

```jsx
// actions/islands.jsx
import { hydrateRoot } from 'react-dom/client';
import { Counter } from '../components/Counter.jsx';

export function counter({ element, props }) {
    hydrateRoot(element, <Counter {...props} />); // or createRoot(element).render(…)
}
```

**Vue**

```js
// actions/islands.js
import { createSSRApp } from 'vue';
import Counter from '../components/Counter.vue';

export function counter({ element, props }) {
    createSSRApp(Counter, props).mount(element); // or createApp(Counter, props).mount(element)
}
```

**Svelte**

```js
// actions/islands.js
import { hydrate } from 'svelte';
import Counter from '../components/Counter.svelte';

export function counter({ element, props }) {
    hydrate(Counter, { target: element, props }); // or mount(Counter, { target: element, props })
}
```

### When an island loads

| `cw-trigger` | The island loads | Astro equivalent |
| --- | --- | --- |
| `visible` | As it approaches the viewport | `client:visible` |
| `idle` | Once the page has settled | `client:idle` |
| `load` | Right after CycleWire starts | `client:load` |
| `media:(…)` | While a media query matches | `client:media` |

Prefer a trigger over waking an island on click: the click that wakes it is not replayed
to the component.

### Server rendering

Render the component with the props you put in `cw-props`: `renderToString()` from
`react-dom/server` or `vue/server-renderer`, or `render()` from `svelte/server`. The
renderer can be your Node server, or a small render service next to Laravel, Rails or
Django. Each example's `server.js` (`server.jsx` for React) shows the call. Without server rendering, put a
placeholder in the element and mount instead of hydrating.

### Unmount when the island leaves

A framework keeps a mounted component alive until you unmount it. If the island's element
can be removed (an htmx or Turbo swap, `morph()`, your own code), unmount it then. The
examples use [`removed()`](../examples/shared/removed.js), a small helper that watches every
island with one MutationObserver:

```js
export function counter({ element, props }) {
    const root = hydrateRoot(element, <Counter {...props} />);
    removed(element).then(() => root.unmount()); // Vue: app.unmount(); Svelte: unmount(island)
}
```

## CycleWire actions inside components

The attributes work in JSX and templates as they are:

```jsx
// React
<button cw-action="counter#save" cw-props={JSON.stringify({ count })}>Save</button>
```

```vue
<!-- Vue -->
<button cw-action="counter#save" :cw-props="JSON.stringify({ count })">Save</button>
```

```svelte
<!-- Svelte -->
<button cw-action="counter#save" cw-props={JSON.stringify({ count })}>Save</button>
```

- **Props are read when the action runs**, so the action gets what the component rendered
  last.
- **The action is a plain module.** The same `counter#save` works in server-rendered HTML,
  and it needs no framework code.
- **Actions work before hydration** because they only need the HTML. A Save button in a
  server-rendered island works while the framework is still downloading.
- **Results come back as events.** `cw:done` (`detail: { action, result }`) and `cw:error`
  bubble up from the action's element:

  ```jsx
  // React
  useEffect(() => {
      const element = root.current;
      const done = (event) => {
          if (event.detail.action === 'counter#save') setSaved(event.detail.result.count);
      };
      element.addEventListener('cw:done', done);
      return () => element.removeEventListener('cw:done', done);
  }, []);
  ```

  In Vue, `@cw:done="done"` on an element. In Svelte, an attachment with `on()` from
  `svelte/events`: `{@attach (node) => on(node, 'cw:done', done)}`.
- **Components can run actions too:** `run('cart#add', element)` resolves to the handler's
  return value, through the same once, debounce and concurrency rules as a click.

## Events: who runs first

React 17 and later handle events at the root container, Vue on each element, and
Svelte 5 at the element you mount into. All of these sit below the document, where
CycleWire listens, so a component's handler runs first. If it calls `stopPropagation()`,
CycleWire never sees the event. UI kits often do this inside menus and dialogs. Two ways
out:

- **Don't stop propagation.** To close a menu on outside clicks, check where the click
  came from instead: `if (!menu.contains(event.target)) close()`.
- **Start CycleWire with `capture: true`.** It then listens in the capture phase and runs
  before any component handler.

A component calling `preventDefault()` does not stop a CycleWire action. Give each
element one owner per event: a component handler or a CycleWire action, not both.

## Hydration

CycleWire changes markup only while an action runs: it sets `cw-pending` on the
action's element, and `aria-busy` in `drop` mode. The island's own element gets these
while the islands action runs, but frameworks hydrate an element's content, not the
element itself, so hydration never sees them.

An action inside the island's HTML can still be running when hydration happens, for
example after a click on a server-rendered Save button. Vue and Svelte keep the extra
attributes without complaint. React's development build logs an attribute mismatch for
them. The warning is harmless: React leaves attributes it did not render alone, and
CycleWire removes them when the run ends.

## Other frameworks

- **Preact:** as React, with `hydrate()` or `render()` from `preact`.
- **Solid:** `hydrate()` or `render()` from `solid-js/web`.
- **Lit and other web components** define themselves. CycleWire observes their shadow
  roots; see [shadow DOM](shadow-dom.md).
- **Angular:** Angular Elements turns components into custom elements, which then work like
  any web component.
- **Next.js, Nuxt, SvelteKit** render and hydrate the whole page themselves, so CycleWire
  has little to add there. **Astro** has islands of its own; CycleWire covers the parts of
  the page that are not islands. See [integrations](integrations.md#astro).
