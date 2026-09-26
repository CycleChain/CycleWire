# Performance

## What the page pays on load

- **One script.** The core is 5.0 kB brotli, or 5.2 kB for the classic-script build
  that also starts itself.
- **No action code** until someone reaches for it, or a trigger or preload asks for it.
  On screens that cannot hover, the modules of the actions in view are fetched once the
  page is idle (see below).
- **No work on load** beyond attaching listeners and one `querySelectorAll` for triggers
  and scheduled preloads. No component renders; state is not even parsed until it is
  used.

Check it on any page:

```js
CycleWire.loaded(); // → [] after load
```

## Load CycleWire early

Clicks that land before CycleWire starts fall back to the browser: links navigate and
forms submit, but plain buttons do nothing. [`cyclewire/early`](early.md), 0.4 kB inline
at the top of `<head>`, keeps those taps, shows them as pending and runs them once
CycleWire starts. Starting early shortens the wait itself:

```html
<link rel="modulepreload" href="/assets/app.js">
<script type="module" src="/assets/app.js"></script> <!-- in <head> -->
```

For the fastest possible activation, inline the 5.2 kB classic-script build in the
`<head>`, the way Qwik inlines its loader. It starts CycleWire while the page is still
parsing, from the JSON block before it:

```js
// Your server: read the build once, then write both scripts into every page's <head>.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const core = readFileSync(fileURLToPath(import.meta.resolve('cyclewire/dist/cyclewire.global.min.js')), 'utf8')
    .replace(/\n\/\/# sourceMappingURL=.*$/, '');
const head = `<script type="application/json" data-cyclewire>{"actions": {"cart": "/js/cart.js"}}</script>
<script>${core}</script>`;
```

## Make interactions fast (INP)

- **Code arrives before the click.** On `pointerover`, `focusin` and `pointerdown`,
  CycleWire starts fetching the module. For URL entries it uses `modulepreload`, which
  downloads and compiles without running.
- **Quick handlers run at once; slow ones after a paint.** A handler whose module is in
  memory runs in the same task as the event, so its result lands in the next frame. If
  its synchronous part held the main thread for more than 10 ms the last time it ran,
  CycleWire yields to the browser first (`scheduler.yield()` where available,
  `setTimeout(0)` otherwise), so the `cw-pending` style and the pressed state paint
  before it runs. The measure is per action and per device: a handler that is quick on a
  laptop and slow on a phone yields only on the phone.
- **Keep handlers short.** Split heavy work with `await scheduler.yield()` (feature
  detected) and pass `signal` to fetches so superseded work stops.
- **Debounce chatty inputs:** `cw-debounce="150"`.

## Choose when to fetch

| `cw-preload` | Use for |
| --- | --- |
| `intent` (default) | Almost everything. On touch screens it also fetches what is in view once the page is idle |
| `visible` | Below-the-fold features that are likely to be used |
| `idle` | Features most visitors use, fetched once the page settles |
| `load` | The one action that must be ready right away, or actions that call gesture-gated APIs |
| `none` | Rare, heavy features |

Speculative preloads are skipped when the user asked to save data or is on a 2G
connection. An explicit `preload()` call is not. URL entries are preloaded at high
priority on intent and for `load`, and at low priority when the fetch is speculative
(`visible`, `idle`, the look-ahead below), so they never hold up the page's own images
and stylesheets.

A touch screen gives no warning before a tap: the finger lands and the click follows
about 100 ms later, too soon for a module to arrive over a slow connection. So where the
primary input cannot hover, the default looks ahead: once the page is idle, the modules
of the `cw-action` elements that near the viewport are fetched (a URL entry is
downloaded and compiled without running; a loader function, such as Vite's, is
imported, [as preloading always does](html-api.md#cw-preload)). Choose with
`start({ preload })`: `'auto'` (the default), `'visible'` to look ahead on every screen,
or `'intent'` to fetch nothing before intent.

## Fetch code and data together

A handler that fetches data after its module arrives pays two round trips on its first
use: first the code, then the data. The [`cyclewire/prefetch`](prefetch.md) plugin starts
the data at the same moment as the code. Name the URL on the element, and fetch it with
`ctx.fetch`:

```html
<a href="/products/42" cw-action="quickview" cw-prefetch="/api/products/42">Quick view</a>
```

```js
// main.js
import { start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';

start({ actions, plugins: [prefetch()] });

// actions/quickview.js
export async function run({ element, fetch, signal }) {
    const product = await (await fetch(element.getAttribute('cw-prefetch'), { signal })).json();
    // …
}
```

When the pointer reaches the link, or a finger lands on it, the module and the data are
fetched side by side, and `ctx.fetch` takes the response that is already on its way. On a
desktop that hovers for a tenth of a second before clicking, that is most of a round trip
saved; on a phone, the time between touch and click.

## Preload the action people reach for first

People tap the button they came for as soon as they see it, often before the page has
settled. If its code only starts downloading then, the tap waits a round trip before the
request it sends. Preload that one action's code with the page: write a
`<link rel="modulepreload">` for its chunk, and for the chunks it imports, next to the
entry's. With Vite, the manifest names them:

```js
// Your server, reading Vite's .vite/manifest.json.
const chunks = (key) => [manifest[key].file, ...(manifest[key].imports ?? []).flatMap(chunks)];
const preloads = new Set([...chunks('src/main.js'), ...chunks('src/actions/cart.js')]);
const head = [...preloads].map((file) => `<link rel="modulepreload" href="/build/${file}">`).join('');
```

The page then downloads that action's code up front, a few kilobytes, in exchange for a
first tap that waits only for the server. `cw-preload="load"` does the same without
touching the server, but starts later: when CycleWire starts, after the HTML is parsed.
Keep it to the one or two actions nearly every visitor uses.

## What the benchmark shows

The [benchmark](../bench/README.md) builds one product page with CycleWire and with other
stacks, and measures loads, the time from an input to its result, a tap in the first frame
after first paint, and a repeat visit, on a throttled phone and on a desktop
([results](https://cyclechain.github.io/CycleWire/#benchmark)). What it shows about CycleWire,
and what to do about it:

- **Loading costs about what plain HTML costs.** The core is the only script on load and
  nothing runs, so first paint, layout shift and blocking time stay close to the page
  without JavaScript. Preloading the first action and fetching the code of actions in
  view on touch screens cost a few kilobytes and a few milliseconds of script; on the
  phone profile the largest paint lands about 5% after the fastest stack's.
- **Interactions land as fast as hand-written code.** With the defaults and the two
  steps below, a filter, a search, an add to cart and a tap in the first frame after
  paint take as long as the page's vanilla control, and the quick view is the fastest of
  all the stacks: the code of the actions in view is fetched before the tap on touch
  screens, [the action people reach for first](#preload-the-action-people-reach-for-first)
  comes with the page, and [code and data travel together](#fetch-code-and-data-together).
- **Let the bundler preload an action's imports.** Vite fetches the chunks an action
  imports together with the action; a bundler that does not makes the browser find them
  one import at a time.
- **Every choice has a variant that measures it.** The benchmark also runs the CycleWire
  app with nothing fetched ahead of intent, and with its core inlined in `<head>`, so the
  cost and the gain of each recommendation above are numbers, not claims.

## Triggers

- `idle` waits for the window's `load` event and then `requestIdleCallback`, so analytics
  and widgets never compete with first render.
- `visible` shares a single IntersectionObserver.
- In a page prerendered by speculation rules, triggers and preloads wait for
  `prerenderingchange`. A prerendered page nobody opens costs nothing.

## Content that changes

A MutationObserver activates triggers in added content and aborts runs on removed
elements. Its callback only scans added elements with one combined selector. On pages
where a framework re-renders large subtrees constantly, turn it off and call `scan()`
yourself:

```js
start({ actions, mutations: false });
```

## Back/forward cache

CycleWire registers no `unload` or `beforeunload` listeners, so pages stay eligible for
the back/forward cache. All state lives in memory and is restored with the page.

## CSS

Deferring CSS works differently from deferring JavaScript: the stylesheet of anything
visible has to arrive before it paints. [CSS strategy](css.md) covers what to keep small,
what to defer, and how to ship a widget's stylesheet with its action.

## Sizes

`npm run size` measures every bundle with gzip -9 and brotli -q 11, and CI fails when a
budget in `scripts/size.js` is exceeded. The current numbers are in the
[README](../README.md#-size).
