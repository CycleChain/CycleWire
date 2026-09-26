# Getting started

## 1. Install

The quickest start is a new project from a template (Vite, no build step, Astro, or an
existing Laravel app):

```bash
npm create cyclewire@latest
```

To add CycleWire to a project you have, with a bundler:

```bash
npm install cyclewire
```

Without one, load the classic-script build from a CDN. The examples below show both
options side by side.

## 2. Render the markup on the server

CycleWire never renders anything on load. Whatever your server outputs is the UI, and it
should work as plain HTML: links link, forms submit.

```html
<button cw-action="like" cw-props='{"id": 42}'>
    ♡ Like <span class="count">128</span>
</button>
```

`cw-action` names an action. Because this is a `<button>`, it runs on `click`.
Forms run on `submit`, text inputs on `input`, checkboxes and selects on `change`.

## 3. Write the action

An action is an ES module. Export `run` (or a default function). It receives one context
object.

```js
// actions/like.js
export async function run({ element, props, signal }) {
    const response = await fetch(`/api/posts/${props.id}/like`, { method: 'POST', signal });
    const { likes } = await response.json();
    element.querySelector('.count').textContent = likes;
    element.setAttribute('aria-pressed', 'true');
}
```

A module can hold several actions; address them as `module#export`:

```js
// actions/post.js
export function like(ctx) { /* … */ }
export function share(ctx) { /* … */ }
```

```html
<button cw-action="post#like">Like</button>
<button cw-action="post#share">Share</button>
```

## 4. Register and start

With a bundler, register loader functions so the bundler splits each action into its own
chunk:

```js
// main.js
import { start } from 'cyclewire';

start({
    actions: {
        like: () => import('./actions/like.js'),
        post: () => import('./actions/post.js'),
    },
});
```

With Vite, register a whole folder at once:

```js
import { start, fromGlob } from 'cyclewire';

// ./actions/post.js → "post", ./actions/cart/add.js → "cart.add"
start({ actions: fromGlob(import.meta.glob('./actions/**/*.js')) });
```

or let the [Vite plugin](vite.md) do it, and get edits without reloads and typed action
names as well:

```js
import actions from 'virtual:cyclewire/actions'; // with cyclewire/vite in vite.config.js

start({ actions });
```

Without a bundler, map names to URLs in a JSON block placed before the script:

```html
<script type="application/json" data-cyclewire>
    { "actions": { "like": "/js/actions/like.js", "post": "/js/actions/post.js" } }
</script>
<script src="https://cdn.jsdelivr.net/npm/cyclewire@1/dist/cyclewire.global.min.js" defer></script>
```

Relative URLs resolve against the page, not against the CDN. Bare names such as
`"app/like"` go through your page's import map.

## 5. Activate without an event

Some elements should wake up on their own: a map when it scrolls into view, analytics
when the browser is idle.

```html
<div cw-action="map" cw-trigger="visible" cw-props='{"lat": 41.0, "lng": 29.0}'>
    <img src="/static-map.png" alt="Map of our office">
</div>

<div cw-action="analytics" cw-trigger="idle"></div>
<nav cw-action="menu#compact" cw-trigger="media:(max-width: 40em)"></nav>
```

## 6. Style the pending state

While an action runs, its element carries `cw-pending`. For clicks and submits it
also gets `aria-busy="true"`.

```css
[cw-pending] { opacity: .6; cursor: progress; }
```

## 7. Check what loaded

Open the console on your page:

```js
CycleWire.loaded(); // [] until the user reaches for something
```

With a bundler, call `loaded()` on the object `start()` returns.

## Next

- [Actions](actions.md): concurrency, abort signals, errors, patterns.
- [Core first, modules when you need them](modules.md): what the core covers, and when to
  add `css`, `dom`, `morph`, `signals` or `bootstrap`.
- [CSS strategy](css.md): stylesheets that ship with an action.
- [HTML API](html-api.md): every attribute.
- [Concepts](concepts.md): why this is fast.
