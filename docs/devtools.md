# cyclewire/devtools

An inspector that runs inside the page: which actions are registered and loaded, every
run and how it ended, what the development build traces, which triggers are still
waiting, and what any element is bound to. It costs nothing unless you import it, and it
works on any page that runs CycleWire, a production site included. About 7 kB brotli.

```js
import { start } from 'cyclewire';
import { devtools } from 'cyclewire/devtools';

start({ actions, plugins: [devtools()] });
```

A round **CW** button appears in the bottom-right corner. It opens the panel, and so does
**Alt+Shift+W** (Option+Shift+W on a Mac).

## Opening it

**As a plugin, in development.** Added at `start()`, the panel sees everything from the
first trigger on. Keep it out of production builds, for example with Vite:

```js
start({ actions, plugins: import.meta.env.DEV ? [devtools()] : [] });
```

The `cyclewire/vite` plugin does this for you: `devtools: true` opens the panel in
development only.

**From code, at any time.** `install()` finds the CycleWire that started on the page, or
waits for it to start, and returns a function that removes the panel again:

```js
import('cyclewire/devtools').then(({ install }) => install());
```

| Option | Default | |
| --- | --- | --- |
| `open` | `false` | Start with the panel expanded |
| `wire` | the CycleWire that started on the page | The API to inspect, e.g. `import * as wire from 'cyclewire'` |

`devtools()` takes the same options. Calling `install()` again, or adding the plugin as
well, reuses the panel that is already there.

**As a bookmarklet, on any page.** Save this as a bookmark to inspect a page you did not
build, whether it bundles CycleWire or loads it from a CDN:

```text
javascript:void import('https://cdn.jsdelivr.net/npm/cyclewire@1/dist/devtools.min.js').then((m)=>m.install({open:true}))
```

A page whose Content Security Policy does not allow scripts from jsDelivr blocks it.

## What it shows

| Tab | |
| --- | --- |
| Actions | Every registered action module: whether it is loaded, how many elements bind it, its runs and errors so far, with buttons to preload it and to outline its elements. Names the markup uses but nobody registered are flagged. |
| Runs | Every run, newest first: action, element, event, concurrency mode, duration and status. Selecting one outlines its element. |
| Log | Every trace event and every `cw:run`, `cw:done` and `cw:error`, in order. Filter by type, pause, clear. |
| Triggers | Elements with a `data-cw-trigger` or a scheduled `data-cw-preload`, what they wait for, and whether they fired. |
| Element | The bindings of an element you pick: its actions per event with their concurrency mode, trigger, preload, props (parsed, or the JSON error), concurrency, once, debounce, prevent, pending state, whether it sits inside `data-cw-ignore`, and its runs. |

To pick an element, press **Inspect**, then click one. The panel takes the bound element
rather than the text or icon inside it. While you pick, the page receives no hover, press
or click, so nothing runs and nothing is preloaded. From the keyboard, Tab to an element
and press Enter.

Outlines are drawn in the panel's own layer; page elements are never restyled.

## Development and production builds

With the development build (the `development` export condition, or `dist/esm-dev/`),
CycleWire reports every step through the plugins' [`trace`](plugins.md#writing-a-plugin)
hook: what it schedules, preloads and imports, which events it skips and why
(unregistered, cancelled, once, busy), debounced and queued runs, and the start and end
of each run. Runs, their durations and their statuses are exact.

The production build reports none of that. The panel then works from the `cw:*` events
and the DOM: the Log shows `cw:run`, `cw:done` and `cw:error` only, and Runs follows the
concurrency rules to tell apart the runs that happened from the events that were dropped,
skipped or superseded. Durations count from `cw:run`, so they include any debounce or
queue wait.

Versions before `registered()` existed (1.0.x) work too. The Actions tab then lists the
names the markup binds and those that loaded or ran.

The panel knows what happened while it was there. A trigger or preload that fired
before `install()` can show as *not seen*, except a `load` trigger, which fires as soon as
CycleWire sees its element. The plugin is there from the start, so it sees every trigger.

## Keyboard

| Key | |
| --- | --- |
| Alt+Shift+W | Open or close the panel, from anywhere on the page |
| Left, Right, Home, End | Move between tabs |
| Enter | While inspecting, pick the focused element |
| Escape | Stop inspecting; pressed again, close the panel and return focus to where it was |

The panel follows the WAI-ARIA tabs pattern, labels every control for screen readers and
announces finished runs at most every three seconds while it is open. It uses light or
dark colours to match `prefers-color-scheme` and drops its animation for
`prefers-reduced-motion`.

## What it changes on the page

One `<cyclewire-devtools>` element at the end of `<html>`, with all its markup and styles
in an open shadow root, and nothing else: page elements are neither restyled nor given
attributes. It carries `data-cw-ignore`, so CycleWire never runs an action from inside it.

It talks to CycleWire only through the public API, the `cw:*` events and the DOM, so a
bundled copy and a CDN copy never disagree. It keeps the last 500 log entries and 200
runs. The function `install()` returns removes the panel and every listener it added;
CycleWire cannot remove a plugin, so the panel's hooks stay registered and do nothing.
