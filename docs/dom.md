# cyclewire/dom

Safe markup building and one-shot insertion. 2.2 kB brotli.

```js
import { html, fragment, swap, transition, escapeHTML, isSafeHTML, SafeHTML } from 'cyclewire/dom';
```

## `html`

A tagged template that escapes every interpolation for the position it lands in, and
returns `SafeHTML`:

```js
const row = (user) => html`
    <li class="${user.role}">
        <a href="${user.url}">${user.name}</a>
    </li>`;

const list = html`<ul>${users.map(row)}</ul>`;
```

- Text and quoted attribute values are escaped (`& < > " '`).
- Nested `html` results, and arrays of them, are inserted as markup, not escaped twice.
- `null`, `undefined` and `false` render nothing, so `${cond && html`…`}` works.

It **throws** when an interpolation sits where escaping cannot protect it:

| Position | Example |
| --- | --- |
| Tag or attribute name | `<${tag}>`, `<div ${attrs}>` |
| Unquoted attribute value | `<a href=${url}>` |
| Event handler or `srcdoc` value | `<button onclick="${code}">` |
| Inside `<script>`, `<style>` or a comment | `<script>${data}</script>` |

In URL attributes (`href`, `src`, `action`, `formaction`, …, and SVG's animation
attributes `to`, `from`, `by` and `values`) a value that would run as script is refused.
The check reads the whole attribute as the browser will: fixed text and every
interpolation together, arrays and nested `html` included, with case, spaces, control
characters and character references undone. `href="${scheme}${rest}"` cannot assemble a
`javascript:` URL, while `href="/search?q=${query}"` stays fine for any query.

A template must also end outside any tag, comment or raw-text element: `html\`<a href="\``
throws. Nested into another template, an open tag would change what the outer
template's interpolations mean.

The analysis runs once per template (per call site) and is cached.

### `html.raw(markup)`

Marks markup you trust, typically HTML your own server rendered, as safe:

```js
const response = await fetch('/partials/cart');
swap(cart, html.raw(await response.text()));
```

It is the only way to get unescaped markup into CycleWire. Never pass user input to it.

## `fragment(content)`

Turns content into a `DocumentFragment`:

- `SafeHTML` is parsed through an **inert** `<template>`. While parsing, no `onerror` or
  `onload` handlers fire and no images load. Handlers and images come alive once the
  fragment is inserted, but `<script>` elements parsed this way never run.
- Markup containing `<template shadowrootmode>` gets its declarative shadow roots
  attached where the browser supports `setHTMLUnsafe`.
- Strings and numbers become text nodes. Nodes are moved in as they are.

## `swap(target, content, mode = 'inner')`

Inserts content in one operation:

| Mode | Effect |
| --- | --- |
| `inner` | Replace the target's children |
| `outer` | Replace the target itself |
| `before` / `after` | Insert as a sibling |
| `prepend` / `append` | Insert as the first or last child |

Plain strings are inserted as **text**, never as HTML. If the focused element is
replaced by one with the same `id`, focus and the text selection move to the new
element.

Triggers in inserted content activate automatically, because the core watches the DOM.

## `transition(update)`

```js
await transition(() => swap(list, html`…`));
```

Runs a DOM update inside `document.startViewTransition()` when the browser supports it
and the user has not asked for reduced motion; otherwise it runs the update directly.
Resolves once the DOM has been updated.

## Trusted Types

Under `require-trusted-types-for 'script'`, CycleWire parses markup through a policy
named `cyclewire`. Allow it:

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types cyclewire
```

## `escapeHTML(value)`, `isSafeHTML(value)`, `SafeHTML`

Low-level helpers. `SafeHTML` is branded with a symbol, so a plain object from JSON can
never pass as markup.
