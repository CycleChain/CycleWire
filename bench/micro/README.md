# Micro benchmarks

Two of CycleWire's modules do a job other libraries also do, so they can be measured
on their own, next to those libraries:

| Suite | CycleWire | Next to | Runs in |
| --- | --- | --- | --- |
| `signals` | `cyclewire/signals` | `@preact/signals-core` 1.14.4, `alien-signals` 3.2.1, `@vue/reactivity` 3.5.43 | Node |
| `morph` | `cyclewire/morph` | `morphdom` 2.7.8, `idiomorph` 0.8.0 | Chromium, Firefox and WebKit, through Playwright |

CycleWire is used at the commit being measured (`"cyclewire": "file:../.."`, recorded
as, for example, `1.1.0-beta.1+89761f1`); the other libraries at the exact versions in
`package.json`. Every library is called through its documented API with its defaults,
and the results record exactly what each adapter calls. The benchmarks check what every
library computes: a library that gets a result wrong gets **failed** for it, not a time.
They are written by the authors of CycleWire, which is why every choice is written
down here, and why the results say where CycleWire is slower or wrong.

## Run it

Node 22.12 or later. Build CycleWire first, and install the harness, whose Playwright
and Ajv the micro benchmarks use:

```bash
npm ci && npm run build                   # in the repository root
cd bench && npm ci && cd micro && npm ci
npx playwright install chromium firefox webkit
node run.js --suite=signals --samples=5   # about two minutes on a laptop
node run.js --suite=morph --browsers=chromium --samples=5
node report.js out/<file>.json            # Markdown tables
npm test
```

| Option | |
| --- | --- |
| `--suite=all` | `signals`, `morph` or `all` |
| `--browsers=chromium,firefox,webkit` | Which browsers the morph suite uses |
| `--samples=15` | Samples per measurement, after `--warmup=3` that are not recorded |
| `--libraries=cyclewire,preact` | Libraries by id: `cyclewire`, `preact`, `alien`, `vue` (signals); `cyclewire`, `morphdom`, `idiomorph` (morph) |
| `--scenarios=`, `--cases=`, `--operations=` | Run only some, by id |
| `--channel=chrome` | Use an installed Chrome instead of Playwright's Chromium |
| `--seed=1` | Seeds the shuffled order and the bootstrap |
| `--out=<file>` | Where to write the results (default: `out/<date>.json`) |

Results validate against [`../schema/micro.v1.json`](../schema/micro.v1.json). They
hold the machine (as the harness records it, plus a CPU speed index taken in Node),
every browser's version and timer resolution, the version of every library, every raw
sample and every summary. Summaries are the harness's own (`../runner/stats.js`): the
median with a bootstrap 95% confidence interval. The Benchmark workflow runs both
suites weekly and by hand (the `micro` job), writes the report into the job's summary
and keeps the JSON as an artifact.

## Signals

Each library sits behind one small interface, modelled on js-reactivity-benchmark's
`ReactiveFramework`: `signal(value) → { read, write }`, `computed(fn) → { read }`,
`effect(fn)`, `withBatch(fn)`, `withBuild(fn)` and `cleanup()`
([`signals/adapters.js`](signals/adapters.js)).

| Library | signal, computed, effect | withBatch | withBuild, cleanup |
| --- | --- | --- | --- |
| `cyclewire/signals` | `signal`, `computed`, `effect` | `batch(fn)` | none; the effects' dispose functions |
| `@preact/signals-core` | `signal`, `computed`, `effect` | `batch(fn)` | none; the effects' dispose functions |
| `alien-signals` | `signal`, `computed`, `effect` (getter and setter functions) | `startBatch()` … `endBatch()` | `effectScope(fn)`, stopped by `cleanup()` |
| `@vue/reactivity` | `shallowRef`, `computed`, `effect` | none: 3.5 exports no batching function, so effects run after every write | `effectScope().run(fn)`, stopped by `cleanup()` |

Every scenario runs, for every library, in a Node process of its own (`node
--expose-gc`, with `NODE_ENV=production`, which gives `@vue/reactivity` its production
build), so what the JIT learned from one library never helps or hurts another. The
libraries take turns in a shuffled order. A process runs the warm-up samples, then the
recorded ones, with a garbage collection before each; a scenario whose check fails, or
that throws, crashes or runs out of time, is recorded as failed for that library.

The kairo set, cellx and the dynamic graphs are ports of
[js-reactivity-benchmark](https://github.com/transitive-bullshit/js-reactivity-benchmark)'s
scenarios (MIT), rewritten in [`signals/scenarios.js`](signals/scenarios.js); the
creation and update scenarios are this benchmark's own.

| Scenario | A sample times | Checked |
| --- | --- | --- |
| Kairo: avoidable propagation, broad propagation, deep propagation, diamond, mux, repeated observers, triangle, unstable | 1,000 iterations of the scenario's update loop, on a graph built once | Every value, and exactly how often each effect ran. The diamond and the triangle also check that their sum never reads branches from different writes (no glitches). Avoidable propagation checks that an effect whose input never changes never runs again, and counts how many times computeds ran |
| cellx, 1,000 and 2,500 layers | Reading the last layer, writing the four start signals in one batch, reading it again (building the layers is not timed) | The last layer's values, against a plain loop |
| Create 100,000 signals, 100,000 computeds (each read once, since all four evaluate lazily), 100,000 effects | The creation | Every value, and that every effect ran once |
| Update 1,000 signals with one effect each, in one batch and one write at a time | 100 rounds of writes | Every effect ran once per round and saw the new value |
| Update 100 signals in one batch, summed by one computed with one effect | 1,000 rounds | The sum, and that the effect ran once per round (once per write for a library without batching) |
| Dynamic component (10 × 10, a quarter of the computeds dynamic, a fifth of the leaves read) and very dynamic (100 × 15, half dynamic) | Writing one signal and reading the leaves, 15,000 and 2,000 times (building is not timed) | The leaves' sum, against a plain evaluation of the same graph; how many times computeds ran is recorded |

Two changes from the original: `busy()`, the "expensive" work in avoidable propagation,
folds its result into a variable so the JIT cannot drop it (otherwise the scenario would
not measure avoided work), and the checks are exact, where the original's
`console.assert` calls only print. The tests (`test/signals.test.js`) run every scenario
with every library, and run the checks against deliberately wrong implementations (one
that shows a half-updated graph, one that never updates, one that re-runs effects when
nothing changed, one that claims to batch but does not) to show they fail.

## Morph

Each library makes a container's children match target markup given as a string, the
way its documentation shows ([`morph/adapters.js`](morph/adapters.js)); each parses the
string itself, and that parsing is part of the time.

| Library | Call |
| --- | --- |
| `cyclewire/morph` | `morph(container, html.raw(markup))`: elements pair by id, then `cw-key`, then by tag at the same position |
| `morphdom` | `morphdom(container, '<div>' + markup + '</div>', { childrenOnly: true })`, keyed by id (its default `getNodeKey`). A string must be one element, so the markup is wrapped in the container's own tag, whose attributes `childrenOnly` leaves alone |
| `idiomorph` | `Idiomorph.morph(container, markup, { morphStyle: 'innerHTML' })`, with its default id-set matching and focus restoring |

The test page ([`morph/page.js`](morph/page.js)) is served on 127.0.0.1 by
[`morph/server.js`](morph/server.js), with every library loaded from its own package
files as ES modules and nothing from the network. It is cross-origin isolated (COOP and
COEP headers), which gives `performance.now()` the finest resolution each browser allows
(recorded with the results). Each library has a page of its own, in a browser context of
its own.

### Correctness

One row per case, pass or fail per library and browser. Each case starts a fresh page,
does what a person would have done (focus, type, scroll, open), morphs, and checks the
result ([`morph/cases.js`](morph/cases.js)). The final markup is compared in a canonical
form: attributes sorted, namespaces spelled out, `<template>` contents included, adjacent
text merged.

| Case | What a person would want | Why |
| --- | --- | --- |
| The final markup equals the target | The container holds exactly what the new HTML describes | Keeping state is a refinement of this |
| A keyed list reordered keeps each element | Every item with an id is the same element, only moved | Elements carry state the markup does not: listeners, animations, widgets |
| A focused input keeps focus and its selection while its surroundings change | The input keeps focus and the selected text while a notice appears before it and the text around it changes | Losing focus mid-typing sends keystrokes nowhere |
| An input's typed value survives when the new markup does not set a value | What was typed stays | The server cannot know what was typed |
| Attributes are added, changed and removed | Exactly the new attributes, on the same elements | How server markup changes looks and states |
| Text changes | The new text, in the same elements | The most common update |
| SVG children are created in the SVG namespace | New bars, labels and paths are SVG elements | An element in the wrong namespace renders nothing, silently |
| An xlink:href added to an SVG element is in the XLink namespace | A sprite icon's `<use>` shows its symbol | An edge case: a plain attribute named "xlink:href" references nothing |
| An open `<details>` stays open when the new markup does not say otherwise | A section the person opened stays open; one the markup marks open opens | The server renders it closed because it does not know |
| A scrolled container keeps its element and scroll position | The log stays where it was scrolled | Jumping to the top while someone reads |
| A custom element keeps its identity | The same element, with its state and shadow root, seeing its new attribute | Replacing it resets its state |
| `<template>` content is updated | The template's content matches the new markup | A stale template stamps out old markup |

Two cases are where the libraries **differ by design**, and the report marks them:
morphdom and idiomorph make an input's value match the markup (an input without a value
attribute is emptied, so a server can clear a form by sending it again), while CycleWire
copies the value only when the server changed the attribute; and opening a `<details>`
sets its `open` attribute, so to a morph that copies attributes, markup without `open`
says "closed" (each library can be told otherwise with its update callback).

### Speed

1,000 rows keyed by id ([`morph/rows.js`](morph/rows.js)), each `<div class="row"
id="row-N">` with a number, a link and a button, one per line as a server writes them,
and seven operations: update every 10th row's text, swap two rows (the 2nd and the
999th), prepend a row, remove every other row, reverse them, replace them with 1,000
cards of another structure and other ids, and fill an empty container.

For each operation, every library first runs it once untimed with a MutationObserver on
the container, which counts the records (fewer records is less work, and elements that
are not touched keep their state), and the rows that stayed the same elements. Then come
the warm-up and the samples, in rounds, the libraries in a shuffled order in every
round. Every sample starts from a fresh copy of the rows (set with `innerHTML`, laid out,
and a task later), collects garbage in Chromium (Firefox and WebKit do not expose it),
and times the morph call with `performance.now()`, then the style and layout it forces.
Every sample's result is checked against the target; a library whose result is wrong
gets **failed** for that operation.

## Layout

| Path | |
| --- | --- |
| `run.js`, `report.js` | Run the suites and write JSON; print it as Markdown |
| `signals/` | The adapters, the scenarios, the per-process runner and the parent that starts it |
| `morph/` | The adapters, the cases, the rows and operations, the test page, its server and the Playwright runner |
| `environment.js`, `validate.js` | What the results record about the machine and the libraries; validation against the schema |
| `test/` | `node --test` tests: adapters, scenarios and checks, the schema, the report, the operations, the libraries in Chromium |

## Limitations

- Micro benchmarks measure one module at a time, on synthetic work. They say nothing
  about a whole page; the main benchmark does.
- The kairo scenarios run each update loop 1,000 times per sample, as the original does;
  the numbers are comparable within a run, not with js-reactivity-benchmark's.
- `@vue/reactivity` has no public batching, so scenarios that write several signals at
  once make its effects run more often. That is its documented behaviour, and the check
  for it expects it.
- Firefox and WebKit give pages no way to collect garbage, so a collection can land
  inside a sample there; the medians and intervals absorb it, and the results say which
  browsers collected.
- Shared CI machines are noisier than a dedicated one; the machine, its load at the start
  and the end, and a CPU speed index are recorded with every run.
