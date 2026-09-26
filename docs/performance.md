# Performance

## What the page pays on load

- **One script.** The core is 4.8 kB brotli, or 5.0 kB for the classic-script build
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
forms submit, but plain buttons do nothing. Start early:

```html
<link rel="modulepreload" href="/assets/app.js">
<script type="module" src="/assets/app.js"></script> <!-- in <head> -->
```

For the fastest possible activation, inline the 5.0 kB classic-script build in the
`<head>`, the way Qwik inlines its loader.

## Make interactions fast (INP)

- **Code arrives before the click.** On `pointerover`, `focusin` and `pointerdown`,
  CycleWire starts fetching the module. For URL entries it uses `modulepreload`, which
  downloads and compiles without running.
- **Feedback paints first.** When the module is already in memory, CycleWire yields to
  the browser before calling your handler, with `scheduler.yield()` where available and
  `setTimeout(0)` otherwise. The `cw-pending` style and the pressed state paint
  before your code runs.
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
connection. An explicit `preload()` call is not.

A touch screen gives no warning before a tap: the finger lands and the click follows
about 100 ms later, too soon for a module to arrive over a slow connection. So where the
primary input cannot hover, the default looks ahead: once the page is idle, the modules
of the `cw-action` elements that near the viewport are fetched (downloaded and
compiled, not run). Choose with `start({ preload })`: `'auto'` (the default), `'visible'`
to look ahead on every screen, or `'intent'` to fetch nothing before intent.

## What the benchmark shows

The [benchmark](../bench/README.md) builds one product page with CycleWire and with other
stacks, and measures loads, the time from an input to its result, a tap in the first frame
after first paint, and a repeat visit, on a throttled phone and on a desktop
([results](https://cyclechain.github.io/CycleWire/#benchmark)). What it shows about CycleWire,
and what to do about it:

- **Loading costs about what plain HTML costs.** The core is the only script on load and
  nothing runs, so first paint, layout shift and blocking time stay close to the page
  without JavaScript.
- **An action's first use waits for its code.** On a slow network that is a round trip
  before the handler runs. On touch screens there is no hover, so intent preloading only
  starts when the finger lands; the default now also fetches what is in view once the page
  is idle. A tap that comes sooner than that still waits: preload the one action people
  reach for first with `load`.
- **Code, then data.** A handler that fetches data after its module arrives pays two round
  trips on its first use. Preload those modules earlier.
- **Let the bundler preload an action's imports.** Vite fetches the chunks an action
  imports together with the action; a bundler that does not makes the browser find them
  one import at a time.

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
