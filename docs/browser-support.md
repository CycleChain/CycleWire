# Browser support

## Baseline

The core needs an ES2020 browser with `composedPath()`, `AbortController`, dynamic
`import()` and `replaceChildren()`: **Chrome/Edge 86+, Firefox 78+, Safari 14+**. The test
suite runs on current Chromium, Firefox and WebKit through Playwright.

## Progressive enhancements

Everything newer is feature-detected. Without it, CycleWire falls back as below.

| Feature | Used for | Available in | Fallback |
| --- | --- | --- | --- |
| `scheduler.yield()` | Yielding before a handler runs off a cached module | Chrome 129+, Firefox 142+ | `setTimeout(0)` |
| `requestIdleCallback` | `idle` triggers and preloads | Chrome, Firefox | A short timeout after `load` (Safari) |
| `<link rel="modulepreload">` | Fetching URL actions without running them | All current browsers | – |
| Invoker Commands (`command` event) | `data-cw-on-command` | Chrome 135+, Firefox 144+, Safari 26.2+ | The event never fires; other bindings work |
| View Transitions (`startViewTransition`) | `transition()`, `morph(…, { transition: true })` | Chrome 111+, Safari 18+, Firefox 144+ | The update runs without animation |
| `Element.moveBefore()` | Moving elements in `morph()` without resetting iframes, media or focus | Chrome 133+, Firefox 144+ | `insertBefore`, with focus and selection restored |
| `setHTMLUnsafe()` | Declarative shadow DOM in fetched markup | Current Chrome, Safari and Firefox | Shadow templates stay plain `<template>` elements |
| Trusted Types | The `cyclewire` policy | Chromium | Not needed |
| `document.prerendering` | Holding triggers in prerendered pages | Chromium (speculation rules) | Not needed |
| `navigator.connection` | Honouring Save-Data and 2G | Chromium | Preloads always run |

## Known platform quirks

- **iOS Safari** does not deliver delegated `click` events for non-interactive elements
  (a clickable `<div>`) unless they have `cursor: pointer`. Use buttons and links, or add
  the style. The development build warns about click bindings on elements that cannot be
  focused.
- **Gesture-gated APIs** (clipboard, popups, share) can refuse to run after a slow first
  import, and Safari is the strictest. See [actions](actions.md#the-upgrade-pattern).
