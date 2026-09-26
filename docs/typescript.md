# TypeScript

Types ship with the package, for the core and every module, and JavaScript projects get
them through JSDoc and their editor.

## Handlers

`Context<Props, Element>` types what a handler receives. `defineAction()` does the same
without annotating the parameter, and returns the handler unchanged:

```ts
import { defineAction } from 'cyclewire';

export const add = defineAction<{ sku: string; quantity?: number }, HTMLFormElement>(async ({ props, element, signal }) => {
    await fetch('/cart', { method: 'POST', body: new FormData(element), signal });
    return props.sku;
});
```

In JavaScript, the same with JSDoc:

```js
/** @param {import('cyclewire').Context<{ id: number }, HTMLButtonElement>} context */
export function run({ props, element }) {
    element.disabled = props.id < 0;
}
```

`props` is what `cw-props` holds, parsed; the type states what your markup
promises, since the page's HTML is not checked against it.

## Action names

`ActionName` is any string until your project lists its actions in a global
`CycleWireActions` interface. `cyclewire types` and the [Vite plugin](vite.md) write that
interface for you:

```ts
// cyclewire-actions.d.ts, generated
interface CycleWireActions {
    "cart#add": typeof import("./actions/cart.js")["add"];
    "like": typeof import("./actions/like.js")["run"];
}
```

Once it is part of the project (`tsconfig.json` includes it; the default location, next
to the actions directory, usually is):

```ts
import { preload, run, type ActionName, type PropsOf } from 'cyclewire';

run('cart#add');          // ok
run('cart#remove');       // error: not an action
preload('like');          // ok

type AddProps = PropsOf<'cart#add'>; // { sku: string; quantity?: number }
```

JavaScript actions are typed from their JSDoc, so `tsconfig.json` needs `allowJs` for
the generated file to import them.

## Plugins

`Plugin` types every hook, including the development build's
[`trace`](plugins.md#writing-a-plugin), whose events are `TraceEvent`.

## Markup

Types cannot see your templates. [`cyclewire check`](cli.md) reads them instead: every
`cw-action` must name a registered module and one of its exports, and the other
`cw-*` values must be ones CycleWire understands.
