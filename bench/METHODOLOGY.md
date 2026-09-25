# Methodology

This benchmark is maintained by the authors of CycleWire, which is one of the stacks it
measures. Everything below is written so that you can check it: the scenario is the
same for every stack, conformance is automatic, every choice a stack makes is recorded
with the documentation behind it, and the raw samples are published with the summaries.

## 1. The scenario

Wirestore is one server-rendered product page:

- a header with a cart summary (item count and total);
- a search form, whose results update as you type;
- seven category filters, plus "All";
- 50 product cards, each with an image, name, category, price, "Add to cart" and "Quick
  view";
- a quick view dialog with the product's description;
- a newsletter form.

The products come from [`scenario/products.json`](scenario/products.json), generated with
a fixed seed by [`scripts/products.js`](scripts/products.js). Every stack links the same
stylesheet, [`scenario/app.css`](scenario/app.css), and shows the same 50 images: 480×360
WebP files of 17–19 kB, drawn with photographic grain so their size resembles product
photos. The first four cards load their image eagerly, the rest lazily.

The stacks all use the same server-side data, and a shared JSON API is available to every
stack at the same paths (see [CONTRIBUTING.md](CONTRIBUTING.md)). A stack may use it, or
reach the same data its own way (server actions, form actions, partials), as its
documentation recommends.

## 2. Delivery

Every stack runs its own production server, and the browser reaches it through
[`proxy/server.js`](proxy/server.js), which applies one delivery policy to all of them:

- **TLS and HTTP/2**, as in production. Chrome trusts the proxy's self-signed key through
  `--ignore-certificate-errors-spki-list`, which, unlike ignoring certificate errors, keeps
  the HTTP cache working.
- **Compression by the proxy.** The upstream is asked for uncompressed bodies. Responses
  rendered per request (HTML, JSON, React Server Component payloads) are compressed with
  brotli at quality 5 and flushed chunk by chunk, so streamed HTML stays streamed. Static
  assets (JavaScript, CSS, SVG) are compressed with brotli at quality 11, as a CDN would
  store them.
- **Caching.** Static assets are cacheable for a year and immutable. Everything else is
  `no-store`: every visit renders on the server. Validators are removed, so no stack gets
  `304` responses and none depends on its server's cache headers.
- Other response headers pass through unchanged, among them `Set-Cookie` and `Link`
  (some stacks send their module preloads that way).
- The stylesheet, the images and the JSON API are served by one shared server behind the
  same proxy, so they are the same bytes for every stack.

The proxy runs in its own process, so compression never delays the runner.

## 3. Conformance

A stack's numbers are recorded only if it passes every check in
[`runner/conformance.js`](runner/conformance.js), which runs before measuring:

| Check | |
| --- | --- |
| `renders-without-javascript` | With JavaScript disabled, the page's visible text equals [`golden.json`](scenario/golden.json) |
| `renders-per-request` | With a cart cookie, the header shows that cart without JavaScript: the page is rendered per request, not prerendered |
| `same-text-after-scripts-run` | Once scripts have run and the page has settled, the text is still the same |
| `http2` | The document arrived over HTTP/2 |
| `same-origin` | Nothing is fetched from another origin |
| `one-stylesheet` | `/assets/app.css` is the only stylesheet, and inline `<style>` adds at most 512 bytes |
| `no-service-worker`, `no-prerendering` | No service worker, no speculation rules or prerender hints |
| `same-images` | The cards on the first screen use the same image URLs, sizes and `loading` values |
| `no-errors` | No console errors or uncaught exceptions |
| `journey-*` | Each of the five interactions produces its result, after which the page's text equals the golden text for that state |

Visible text is every rendered text node outside `<script>`, `<style>` and `<template>`,
leaving out text that is visually hidden for screen readers (a box of at most 1×1 px that
clips its content, such as a router's live-region announcer), compared with whitespace
removed, so markup may differ as long as what people read is the same. The golden text is read from the `static` stack
([`scripts/golden.js`](scripts/golden.js)).

## 4. Profiles

| | Mobile | Desktop |
| --- | --- | --- |
| Network | Lighthouse's slow 4G: 150 ms RTT, 1.6 Mbps down, 750 kbps up | Lighthouse's dense 4G: 40 ms RTT, 10 Mbps |
| Applied as | 562.5 ms added to each request, 1.47 Mbps down, 675 kbps up | 150 ms per request, 9.2 Mbps down and up |
| CPU | 4× slowdown | none |
| Screen | 412×823 at 1.75× (Lighthouse's Moto G Power) | 1350×940 at 1× |
| Input | touch | mouse |

The network is throttled inside the browser with the Chrome DevTools Protocol. Latency is
then added per request rather than per round trip, so it is multiplied by 3.75 and the
throughput by 0.9, the adjustments Lighthouse uses for the same reason. Both profiles use
them.

## 5. Visits and order

Every visit uses a fresh browser context: an empty cache, no cookies, a new connection.

| Visit | |
| --- | --- |
| Journey | Load the page, wait until it settles, then perform one interaction and wait for its result |
| Early tap | Load the page and tap "Add to cart" in the first frame after first paint in which the button is on screen |
| Repeat | Load the page and let it settle, then load it again in the same context |

One iteration makes each visit once for every stack (five journeys, one early tap, one
repeat), in an order shuffled with a seeded generator, so a slow minute on the machine
does not land on one stack. The first pass over every visit is a warm-up and is not
recorded. Every journey visit also records its load, so load metrics have five samples
per iteration.

**Settled** means: the `load` event has fired, no request has been in flight for one
second, and no long task has run for one second.

## 6. Load metrics

| Metric | Definition |
| --- | --- |
| TTFB | From sending the document request to its response headers arriving, from the DevTools Protocol, so it includes the emulated latency |
| Server response | Navigation Timing's `responseStart − requestStart`. With DevTools throttling the latency is added when the response is delivered, so this is the time the stack's server (behind the proxy) took to start answering |
| FCP, LCP | The `paint` and `largest-contentful-paint` entries |
| CLS | The largest session window of layout shifts without recent input, as web-vitals computes it |
| TBT | Total Blocking Time between FCP and settling: the part of every long task beyond 50 ms, with tasks clipped to that window as Lighthouse does |
| Settled | The later of the end of the `load` event, the end of the last resource and the end of the last long task |
| Main thread | Task and script time from the DevTools Protocol's `Performance.getMetrics`, over the visit |
| Bytes | From the DevTools Protocol: `encodedDataLength` (on the wire, headers included) and decoded body size, grouped by resource type |
| Heap, nodes, listeners | `JSHeapUsedSize`, `Nodes` and `JSEventListeners` from `Performance.getMetrics`, read in the repeat visit after the first load has settled and garbage has been collected (Chrome keeps counting removed listeners until they are collected) |

Times are in milliseconds since the start of navigation and include the CPU slowdown.

## 7. Time to effect

The main interaction metric is the time from the input to the frame that shows its
result:

1. The runner arms a condition in the page (for example "the cart shows 1 item") just
   before the measured input.
2. The input's own timestamp starts the clock: `pointerdown` or `touchstart` for a tap
   or a click, `keydown` for the last key typed.
3. From then on the probe checks the condition once per frame. In the first frame where
   it holds, it records the time right after that frame is painted.
4. If the input navigates, as a form post does without JavaScript, the armed condition
   is carried to the next document, and the first painted frame that satisfies it there
   counts. A full page load is a valid way to show the result.

The interactions:

| Journey | Input | Result |
| --- | --- | --- |
| `cart` | Tap "Add to cart" on the second product | The header shows 1 item |
| `filter` | Tap "Lighting" | Exactly the eight lighting products are visible, and the count says so |
| `search` | Tap the search box, type "lamp" at 120 ms per key | Exactly the four lamps are visible, timed from the last key. Stacks without live search get Enter 120 ms after it. Stacks that search on the server wait 200 ms after the last key, a value the scenario sets for all of them |
| `quickview` | Tap "Quick view" on the fourth product | The dialog is open on that product |
| `newsletter` | Type an email address, tap "Subscribe" | The confirmation from the server is shown |

A tap rests on the screen for 80 ms. On desktop the pointer rests on its target for
100 ms, then presses for 80 ms. The clock starts when the press starts, not when the
pointer arrives. Stacks that start loading code when the pointer arrives or the finger
lands benefit from these pauses, as they would with people, whose hover-to-click times are
usually longer.

**Why not INP alone.** Interaction to Next Paint measures the event's processing and the
next frame. When a handler first has to download its code, the work after the `import()`
is not part of the event, so INP reports lazily loaded interactions as fast even when
people wait for them. Every journey still records the largest Event Timing duration
during the interaction, as a secondary metric.

## 8. The early tap

People tap as soon as they see a button. The early-tap visit taps "Add to cart" in the
first frame after first paint where the button is on screen, then waits for the page to
settle and classifies the outcome:

| Outcome | |
| --- | --- |
| `effect` | The cart updated in the page |
| `navigation` | The browser submitted the form without JavaScript, and the next page shows the updated cart |
| `lost` | Nothing happened |
| `duplicate` | The item was added twice |
| `error` | Anything else |

## 9. Statistics

Each metric is summarised by its median, its quartiles, its range and a 95% confidence
interval for the median from 2,000 bootstrap resamples (seeded, so recomputing gives the
same interval). Differences whose intervals overlap should not be read as differences.
There is no composite score.

## 10. Limitations

- Chromium only: the measurements rely on the Chrome DevTools Protocol.
- Throttling is per request in the browser, not at the packet level. Packet-level
  shaping is planned as a cross-check.
- Shared CI machines are noisier than a dedicated one. Every result records the machine,
  its load average and a CPU speed index.
- The input model (tap duration, hover time, typing speed) is a choice; it is stated
  above and recorded with every result.
- One page is not every application. The page is small and server-rendered by design:
  it is the kind of page this benchmark wants to ask about.

## 11. Reproducing

```bash
cd bench
npm ci
npx playwright install chromium
node run.js --profile=mobile --iterations=15
```

Results name the commit, the browser and the installed version of every stack.
