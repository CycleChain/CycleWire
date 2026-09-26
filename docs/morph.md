# cyclewire/morph

Update part of the page to match new server-rendered HTML while keeping every element
that stays. Focus, the caret, typed-in values, scroll positions, playing media and loaded
iframes survive. This is the job a virtual DOM does, done DOM to DOM, with nothing
re-rendered on the client. 2.2 kB brotli.

```js
import { morph } from 'cyclewire/morph';
import { html } from 'cyclewire/dom';

const response = await fetch('/cart/partial');
await morph(document.getElementById('cart'), html.raw(await response.text()));
```

An action that refreshes a region from the server:

```js
// actions/refresh.js
import { morph } from 'cyclewire/morph';
import { html } from 'cyclewire/dom';

export async function run({ element, signal }) {
    const target = document.querySelector(element.dataset.target);
    const response = await fetch(element.dataset.url, { signal });
    await morph(target, html.raw(await response.text()), { transition: true });
}
```

```html
<button cw-action="refresh" data-url="/partials/leaderboard" data-target="#leaderboard">Refresh</button>
```

## `morph(target, content, options?)`

`content` is `SafeHTML` or a `Node`. Plain strings are refused: mark trusted server
markup with `html.raw()`. The function returns a promise that settles once the DOM is
updated. Without `transition`, the update itself is synchronous.

| Option | Default | |
| --- | --- | --- |
| `children` | `true` | Morph the target's children. `false` morphs the target element itself (its attributes too) |
| `key` | `'cw-key'` | Attribute that pairs siblings without ids |
| `preserve` | `'cw-preserve'` | Attribute marking elements to leave untouched |
| `beforeUpdate(from, to)` | – | Return `false` to leave `from` as it is. Not called for an element already equal to its new markup |
| `beforeRemove(node)` | – | Return `false` to keep a node the new HTML no longer has |
| `transition` | `false` | Run inside a View Transition where supported |

## How elements are matched

For each node in the new content, in order:

1. **Same `id`, anywhere in the old tree.** The old element is moved into place.
   `Element.moveBefore()` (Chrome 133+, Firefox 144+) moves it without resetting iframes,
   media or focus. Safari falls back to `insertBefore`.
2. **Same `cw-key`** among the old siblings.
3. **Same tag**, looked for first right after the last old sibling matched, then further
   on, unless the old element is reserved by an id or key needed elsewhere. Text and
   comments match only the old node right after the last match.

Otherwise the new node is inserted. Old nodes left over are removed. Nodes that still
hold an id needed further on are parked until the end, so an element can move to a
different parent without losing its state.

Of the old siblings that were matched, the longest run already in the new order stays
where it is and only the others move, so swapping two rows of a thousand moves two rows.
An element already equal to its new markup, attributes and descendants alike, is left
alone without being walked, unless the new content holds a `<template>`, whose content
equality does not see.

Give list items ids or keys, just as you would give them keys in React.

## Form controls

Attributes are copied exactly. Properties follow them only when the server actually
changed the attribute, and never on the element that has focus:

- The user's typed value survives if the server sends the same `value` attribute again.
- A changed `value` / `checked` / `selected` attribute updates an unfocused control.
- A `<textarea>` follows its new text the same way.

Focus and the text selection are restored if an update moved the focused element.

## `cw-preserve`

```html
<div id="player" cw-preserve>…third-party widget…</div>
```

The element is kept exactly as it is, contents included. Give it an id so it is matched.

## Scripts and triggers

`<script>` elements in morphed-in content do not run. Triggers (`cw-trigger`) in
new content activate automatically, and runs on removed elements are aborted.

## Shadow roots

Morph updates the light DOM. Existing shadow roots are kept as they are.
