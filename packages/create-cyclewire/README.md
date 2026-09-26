# create-cyclewire

Start a [CycleWire](https://cyclechain.github.io/CycleWire/) project:

```sh
npm create cyclewire@latest
```

It asks for a directory and a template. To answer up front:

```sh
npm create cyclewire@latest my-app -- --template vite
pnpm create cyclewire my-app --template vite
yarn create cyclewire my-app --template vite
```

| Template | | Try it |
| --- | --- | --- |
| `vite` | Vite, with `cyclewire/vite`: every file in `src/actions/` is an action, edits apply without a reload, and the devtools open with Alt+Shift+W | [StackBlitz](https://stackblitz.com/github/CycleChain/CycleWire/tree/main/packages/create-cyclewire/templates/vite) |
| `vanilla` | No build step: an import map, and CycleWire from jsDelivr | [StackBlitz](https://stackblitz.com/github/CycleChain/CycleWire/tree/main/packages/create-cyclewire/templates/vanilla) |
| `astro` | Astro pages activated by CycleWire instead of hydrated islands | [StackBlitz](https://stackblitz.com/github/CycleChain/CycleWire/tree/main/packages/create-cyclewire/templates/astro) |
| `laravel` | Adds actions, a demo view and the steps to an existing Laravel app, leaving the files it already has alone | – |

Every template has a like button and a filtered list, and passes `cyclewire check`. The
[documentation](https://cyclechain.github.io/CycleWire/docs/) takes it from there.

It needs Node 20 or later, and has no dependencies. MIT © [CycleChain](https://cyclechain.io).
