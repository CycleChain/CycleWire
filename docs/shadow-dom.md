# Shadow DOM and Web Components

## Open shadow roots just work, for composed events

CycleWire finds the bound element by walking `event.composedPath()`, which includes the
nodes inside open shadow roots. Composed events such as `click`, `input`, `keydown`,
`focusin` and `pointerdown` bubble out of the shadow root to the document, so a binding
inside a component works with no extra code:

```html
<x-card>
    <template shadowrootmode="open">
        <button data-cw-action="cart#add">Add</button>
    </template>
</x-card>
```

`ctx.target` is captured during dispatch, because `event.target` is retargeted to the
host, or `null`, by the time your handler runs.

## `observe()` for events that stay inside

`submit`, `change`, `toggle`, `beforetoggle`, `command`, `load` and `error` do **not** cross
the shadow boundary. To handle them inside a shadow root, observe it:

```js
import { observe } from 'cyclewire';

class CheckoutForm extends HTMLElement {
    connectedCallback() {
        this.release = observe(this.shadowRoot ?? this.attachShadow({ mode: 'open' }));
    }
    disconnectedCallback() {
        this.release?.();
    }
}
```

`observe(root)` also activates the triggers inside the root and watches it for added
content. An event handled by the shadow root is never handled a second time by the
document.

## Declarative shadow DOM

Server-rendered components with `<template shadowrootmode="open">` get their shadow
roots from the HTML parser. Let CycleWire observe them all at start:

```js
start({ actions, shadow: true });
```

`shadow: true` makes every scan look for open shadow roots and observe them, including
roots in content added later. It costs an extra pass over the scanned elements, so turn
it on only when you use shadow DOM.

HTML fetched later and inserted with [`swap`](dom.md) or [`morph`](morph.md) keeps its
declarative shadow roots in browsers that support `setHTMLUnsafe`.

## Closed shadow roots

Closed roots hide their nodes from `composedPath()` outside the component. Call
`observe()` on the root from inside the component; the shadow root's own listener sees
everything.

## Signals across shadow boundaries

Scopes (`data-cw-state`) do not cross shadow boundaries. Named stores (`$cart.count`) do:
every observed shadow root is searched when a store comes alive, and when content is
added to it later.
