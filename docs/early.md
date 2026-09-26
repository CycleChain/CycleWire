# Taps before CycleWire starts: `cyclewire/early`

On a slow connection the page can be on screen, and tapped, before CycleWire has
arrived. Links and forms do not mind: the browser follows and submits them on its own.
A plain button with a `cw-action` does nothing, and the tap is lost.

`cyclewire/early` keeps those taps. It is a 0.4 kB script that goes inline at the top of
`<head>`. Until CycleWire starts, it notes the clicks, the typing and the changes on
anything bound with a `cw-` attribute, and marks a tapped control with `cw-pending`, so
the tap shows at once. When `start()` runs, it takes the notes and runs them in order,
as if they had just happened.

```html
<head>
    <meta charset="utf-8">
    <script>/* cyclewire/early */</script>
    …
    <script type="module" src="/assets/app.js"></script>
</head>
```

## Adding it

The script has to run before anything can be tapped, so it goes inline, first in
`<head>`: after `<meta charset>`, which has to be in the page's first 1024 bytes, and
before any stylesheet, which an inline script would wait for. A `<script src>` would
work too, but it would hold up the page for a request.

**From your server.** `earlyScript()` returns the script as text; pass it the prefix if
`start()` is given one:

```js
import { earlyScript } from 'cyclewire/early';

const head = `<script>${earlyScript()}</script>`; // earlyScript('data-cw-') for start({ prefix: 'data-cw-' })
```

**From the package's files.** `dist/early.min.js` is the same script, for the default
prefix. Read it once at startup, as you would inline any file:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const early = readFileSync(fileURLToPath(import.meta.resolve('cyclewire/dist/early.min.js')), 'utf8');
```

**With Vite.** The [plugin](vite.md) puts it there in `index.html`, with the plugin's
prefix:

```js
cyclewire({ early: true })
```

## What it keeps, and what it leaves to the browser

- **Clicks, `input` and `change`,** on elements bound with a `cw-` attribute or inside
  one. Nothing inside [`cw-ignore`](html-api.md) is kept.
- **Typing** is kept once per field: the last `input` replaces the ones before it, and the
  handler reads the field's value as it is when it runs.
- **Links and forms** are left to the browser, which follows and submits them without
  waiting for anyone. Where CycleWire would have taken the place of that default (a
  form's submit button, a link with `cw-prevent`), the browser has done it by the time
  CycleWire starts, so the action does not run as well. A link to `#` goes nowhere, so
  its action runs.
- **At most 50 events.** A page that takes that many taps to start has another problem.

When a handler runs from a note, `ctx.event` is the original event. Its default has
already happened, so `event.preventDefault()` does nothing. The action has to be
registered when `start()` runs: pass it to `start()`, not to a later `register()`.

## What it costs

Three listeners on the document, in the capture phase, which CycleWire removes when it
starts, and a few hundred bytes of HTML on every page. It imports nothing and fetches
nothing. It changes nothing once CycleWire is running, so a page that starts before
anyone taps gets nothing from it but has lost nothing either.

## Content Security Policy

It is an inline script. With a nonce-based policy, give it the page's nonce:
`<script nonce="…">`. With a hash-based one, allow its hash, which changes only when
the script does (a new CycleWire version, or another prefix):

```js
import { createHash } from 'node:crypto';

const hash = `'sha256-${createHash('sha256').update(earlyScript()).digest('base64')}'`;
```

## See also

- [Performance](performance.md#load-cyclewire-early): starting CycleWire early.
- The [benchmark](https://cyclechain.github.io/CycleWire/#benchmark) taps the page as soon
  as it paints, and shows which stacks keep the tap.
