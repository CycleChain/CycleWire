# The CycleWire benchmark

One product page, Wirestore, built with each stack the way its documentation
recommends, served through the same proxy and measured the same way in Chromium.

> **Status: preview.** The harness, the two controls and the first wave of stacks are in
> place. The first results will be published as a preview, with a window for corrections,
> before anything is announced.

## What it measures

| | |
| --- | --- |
| **Load** | TTFB, First Contentful Paint, Largest Contentful Paint, Cumulative Layout Shift, Total Blocking Time, time until the page settles, main-thread time (and its script, style and layout parts), JavaScript and total bytes, requests, heap, event listeners |
| **Time to effect** | For five interactions (add to cart, category filter, live search, quick view, newsletter sign-up): from the input to the frame that shows its result |
| **Early tap** | "Add to cart" tapped the moment it is painted, and one and two seconds later: handled in the page, handled by a full page load, lost, or handled twice? |
| **Repeat visit** | The same page loaded again with the cache the first visit left |

Every number is a median over many runs with a 95% confidence interval. There is no
overall score, and the results list the metrics where CycleWire is not the best.
[METHODOLOGY.md](METHODOLOGY.md) defines each metric and explains every choice.

## Stacks

| Stack | What it is |
| --- | --- |
| `static` | Control: the page with no JavaScript. Forms post and links navigate |
| `vanilla` | Control: one small hand-written module, no library |
| `cyclewire` | CycleWire: the core up front, each interaction's code on intent |
| `cyclewire--inline` | Variant: the core inlined in `<head>`, actions registered by URL |
| `cyclewire--no-preload` | Variant: nothing fetched ahead of intent, not even Add to cart |
| `htmx` | htmx: server-rendered fragments swapped into the page |
| `alpine` | Alpine.js: directives in the server's markup, stores for shared state |
| `hotwire` | Hotwire: Turbo Drive, Frames and Streams from the server, Stimulus for the rest |
| `astro` | Astro with Preact islands, nanostores and Astro Actions |
| `next` | Next.js App Router: Server Components, Server Actions, an intercepted modal |
| `nuxt` | Nuxt: universal rendering, useFetch, Nitro server routes |
| `qwik` | Qwik City: resumable components, route loaders and actions |
| `sveltekit` | SvelteKit: load functions, form actions, shallow routing |

Next: Angular. Each stack lives in `apps/<id>/` with its own
`package.json`, lockfile and [`bench.json`](schema/bench.v1.json) manifest, which lists
every choice the app makes and the documentation behind it.
[CONTRIBUTING.md](CONTRIBUTING.md) says what a stack must build, how to add one, and
how a variant (another documented way to build the page with a stack) joins.

## Run it

Node 22.12 or later.

```bash
cd bench
npm ci
npx playwright install chromium
node run.js --check          # does every stack build the same page?
node run.js                  # measure: mobile profile, 15 iterations
```

| Option | |
| --- | --- |
| `--stacks=static,cyclewire` | Which stacks, by folder name (default: all) |
| `--profile=mobile` | `mobile` (slow 4G, 4× CPU slowdown, touch) or `desktop` |
| `--iterations=15` | Runs per stack and measurement |
| `--kinds=journeys,early,repeat` | Which visits to make |
| `--journeys=cart,filter,search,quickview,newsletter` | Which interactions |
| `--offsets=0,1000,2000` | When the early taps land, in ms after the button is first painted |
| `--shaping=devtools` | How the network is slowed: `devtools`, per request, or `netem`, per packet (Linux and sudo) |
| `--seed=1` | Seeds the shuffled run order |
| `--out=<file>` | Where to write results (default: `results/<date>-<profile>.local.json`) |
| `--channel=chrome` | Use an installed Chrome instead of Playwright's Chromium |
| `--serve` | Start the stacks behind the proxy and print their URLs |
| `--skip-build` | Reuse the last build |

Results validate against [`schema/results.v1.json`](schema/results.v1.json). They
record the machine, the browser, the installed version of every stack and each raw
sample, so any summary can be recomputed.

`npm test` runs the harness's own tests. `node scripts/report.js <results.json>` prints
a run as Markdown tables. The Benchmark section of CycleWire's website is built from the
newest run of each profile in `results/` by `scripts/build-site.js`; to see it with your
own runs, start the repository's dev server with `node scripts/serve.js --local-results`.

## Published results

The Benchmark workflow measures both profiles by hand or weekly on GitHub's runners, and
keeps each run as an artifact (results are saved after every iteration, so a run that is
stopped keeps what it measured). Each profile is measured in two parts on two runners,
every stack in each: the journeys with the loads they start with, and the early taps with
the repeat visits. Every metric then comes from one machine, and neither part comes near
the six-hour job limit. `node scripts/merge.js` joins the parts into one results file,
which records both machines. Next to them, a Lighthouse cross-check
(`crosscheck/`, its own `package.json`) compares the harness's load metrics with
Lighthouse's on one runner and writes the table into the job's summary. With the repository variable `BENCH_PUBLISH` set to
`true`, it also opens a pull request from `github-actions[bot]` that replaces the files in
`results/`. Merging new results redeploys the website, whose
[Benchmark section](https://cyclechain.github.io/CycleWire/#benchmark) shows the newest run
of each profile, and `node scripts/readme.js --write` updates the tables in the
repository's README.

## Layout

| Path | |
| --- | --- |
| `scenario/` | The page: products, reference render, stylesheet, images, the shared API, and `golden.json`, the text every stack must show |
| `proxy/` | The HTTP/2 proxy every stack is measured through |
| `runner/` | The in-page probe, journeys, visits, conformance checks and statistics |
| `apps/` | One folder per stack |
| `schema/` | JSON Schemas for manifests and results |
| `scripts/` | Generators for the catalog, the golden text, the report and the website's Benchmark section, and the merge of a run's parts |
| `results/` | Published results |

## Limitations

- Chromium only, because the measurements rely on the Chrome DevTools Protocol.
- The network is throttled per request inside the browser, the way Lighthouse's
  DevTools mode does it, not at the packet level. The "Benchmark network cross-check"
  workflow measures the stacks per packet with netem too, and compares the rankings.
- Results from shared CI machines vary more than results from a dedicated one; the
  machine and a CPU speed index are recorded with every run.
- Input is modelled: a tap rests on the screen for 80 ms, and on desktop the pointer
  rests on its target for 100 ms before pressing. Stacks that start loading code on
  hover or on touch benefit from this, as they would with real people.
