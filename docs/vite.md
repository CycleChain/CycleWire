# Vite plugin: `cyclewire/vite`

The plugin registers every file of your actions directory as its own chunk, and during
development re-registers an action when you edit it instead of reloading the page. It
keeps a declaration file of your action names and props up to date, warns about unknown
actions in `index.html`, and writes a manifest for [`cyclewire check`](cli.md). It
imports nothing from Vite, and works with Vite 5 and later.

```js
// vite.config.js
import { defineConfig } from 'vite';
import cyclewire from 'cyclewire/vite';

export default defineConfig({
    plugins: [cyclewire({ actions: 'src/actions', devtools: true })],
});
```

```js
// src/main.js
import { start } from 'cyclewire';
import actions from 'virtual:cyclewire/actions';

start({ actions });
```

`virtual:cyclewire/actions` is the same map as `fromGlob(import.meta.glob('./actions/**/*'))`:
`src/actions/cart/add.js` is `cart.add`, and each file is imported when its action is
first needed.

## Options

| Option | Default | |
| --- | --- | --- |
| `actions` | The first of `src/actions`, `resources/js/actions`, …, `actions` that exists | The actions directory, relative to Vite's root |
| `types` | `cyclewire-actions.d.ts` next to the actions directory | The declaration file to keep up to date, or `false` |
| `devtools` | `false` | Open [`cyclewire/devtools`](devtools.md) during development |
| `early` | `false` | Put [`cyclewire/early`](early.md) first in `index.html`'s `<head>`, after `<meta charset>`, so taps before CycleWire starts are kept |
| `check` | `true` | Warn about unknown actions and invalid values in `index.html` |
| `prefix` | `'cw-'` | The attribute prefix, as passed to `start()` |
| `manifest` | `'.vite/cyclewire.json'` | Where the build writes the manifest, inside `outDir`, or `false` |

## Editing an action

When an action's file changes, the plugin tells the page, which registers the action
again: its next run imports the new code. Nothing reloads, so what you typed into a form
stays. Adding or deleting an action file changes the registry itself, so that reloads the
page. A change to a module that actions import, rather than to an action, follows Vite's
usual rules.

## Types

On every start, and whenever an action changes, the plugin writes the declaration file
described in [TypeScript](typescript.md): the names in `virtual:cyclewire/actions`, the
handler behind each, and the type of the virtual module. The file is rewritten only when
it changes. Commit it, or list it in `.gitignore`: it is written again anyway.

## With a backend (Laravel, Rails, Django)

Vite's [backend integration](https://vite.dev/guide/backend-integration) works as usual;
import `virtual:cyclewire/actions` from your entry. `index.html` checks do not apply,
because your templates are rendered by the backend: run `cyclewire check` for them,
either against the actions directory or against the manifest of your last build:

```sh
npx vite build && npx cyclewire check --manifest public/build/.vite/cyclewire.json
```

## Development and production builds

Vite resolves the `development` export condition while serving, so the development build
of CycleWire runs: it warns about mistakes and reports what it does to the
[devtools](devtools.md). The production build has neither.
