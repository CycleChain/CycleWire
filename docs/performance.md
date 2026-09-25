# Performance

## What the page pays on load

- **One script.** The core is 4.6 kB brotli, or 4.8 kB for the classic-script build
  that also starts itself.
- **No action code** until someone reaches for it, or a trigger or preload asks for it.
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

For the fastest possible activation, inline the 4.8 kB classic-script build in the
`<head>`, the way Qwik inlines its loader.

## Make interactions fast (INP)

- **Code arrives before the click.** On `pointerover`, `focusin` and `pointerdown`,
  CycleWire starts fetching the module. For URL entries it uses `modulepreload`, which
  downloads and compiles without running.
- **Feedback paints first.** When the module is already in memory, CycleWire yields to
  the browser before calling your handler, with `scheduler.yield()` where available and
  `setTimeout(0)` otherwise. The `data-cw-pending` style and the pressed state paint
  before your code runs.
- **Keep handlers short.** Split heavy work with `await scheduler.yield()` (feature
  detected) and pass `signal` to fetches so superseded work stops.
- **Debounce chatty inputs:** `data-cw-debounce="150"`.

## Choose when to fetch

| `data-cw-preload` | Use for |
| --- | --- |
| `intent` (default) | Almost everything |
| `visible` | Below-the-fold features that are likely to be used |
| `idle` | Features most visitors use, fetched once the page settles |
| `load` | The one action that must be ready right away, or actions that call gesture-gated APIs |
| `none` | Rare, heavy features |

Speculative preloads are skipped when the user asked to save data or is on a 2G
connection. An explicit `preload()` call is not.

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
