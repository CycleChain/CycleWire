# Plugins

## Bootstrap data API: `cyclewire/bootstrap`

Bootstrap 5's interactive components, driven by the same `data-bs-*` markup, without
Bootstrap's 80 kB JavaScript bundle. 2.1 kB brotli.

```js
import { start } from 'cyclewire';
import { bootstrap } from 'cyclewire/bootstrap';

start({ actions, plugins: [bootstrap({ global: true })] });
```

| Component | Markup | Notes |
| --- | --- | --- |
| Collapse | `data-bs-toggle="collapse"` + `data-bs-target` or `href` | `aria-expanded` and `.collapsed` on triggers; accordions via `data-bs-parent` |
| Dropdown | `data-bs-toggle="dropdown"` | Closes on outside click, on item click and on Escape (focus returns to the toggle); arrow keys move between items |
| Modal | `data-bs-toggle="modal"`, `data-bs-dismiss="modal"` | Backdrop, `body.modal-open`, focus moves in, Tab is trapped, Escape closes, focus returns to the trigger; `data-bs-backdrop="static"` / `"false"`, `data-bs-keyboard="false"` |
| Offcanvas | `data-bs-toggle="offcanvas"`, `data-bs-dismiss="offcanvas"` | Backdrop click closes; `data-bs-scroll="true"` keeps the page scrollable |
| Tabs | `data-bs-toggle="tab"`, `"pill"` or `"list"` | Switches `.active`, `aria-selected` and `.tab-pane.show.active` |
| Alert | `data-bs-dismiss="alert"` | Removes the closest `.alert` |

It fires Bootstrap's events: `show.bs.modal`, `shown.bs.modal`, `hide.bs.modal`,
`hidden.bs.modal` (the same for `offcanvas`), `show`/`shown`/`hide`/`hidden` for
`collapse` and `dropdown`, `show.bs.tab`, `shown.bs.tab` and `close.bs.alert`. The `show`
and `hide` events are cancelable.

`{ global: true }` defines `window.bootstrap.Modal` and `window.bootstrap.Offcanvas` when
Bootstrap's JavaScript is absent. Code written against Bootstrap's API then keeps working:

```js
bootstrap.Modal.getOrCreateInstance(document.getElementById('report')).show();
```

The module also exports `Modal`, `Offcanvas`, `openModal(el, trigger?)`,
`closeModal(el)`, `start(options?)` and `stop()`.

**Do not combine it with Bootstrap's own JavaScript**; both would handle the same clicks.

### Prefer the platform for new markup

Modern HTML covers most of these with zero JavaScript:

```html
<button commandfor="confirm" command="show-modal">Delete…</button>
<dialog id="confirm">
    <form method="dialog"><button>Cancel</button> <button value="yes">Delete</button></form>
</dialog>

<button popovertarget="menu">Menu</button>
<div id="menu" popover>…</div>

<details name="faq"><summary>Shipping</summary>…</details>
<details name="faq"><summary>Returns</summary>…</details>
```

These use `<dialog>` with Invoker Commands, the Popover API and exclusive `<details>`
accordions. CycleWire can still react to them: `cw-on-command` receives custom
commands (`command="--refresh"`), and `cw-action` on a `<details>` runs on
`toggle`.

## Signals: `cyclewire/signals`

`signals()` installs two-way bindings and adds `ctx.state` and `ctx.store` to actions.
See [signals](signals.md).

## Stylesheets: `cyclewire/css`

`styles()` preloads the stylesheets listed in `{ module, css }` registry entries with
their modules, and applies them before the handler runs. See [CSS strategy](css.md).

## Writing a plugin

A plugin is a plain object with any of these hooks:

```js
export function analytics({ endpoint }) {
    return {
        // Once, when the plugin is added.
        setup({ prefix, wire }) {
            document.addEventListener('cw:done', ({ detail }) => {
                navigator.sendBeacon(endpoint, JSON.stringify({ action: detail.action }));
            });
        },
        // Extend every action context.
        context(ctx) {
            ctx.track = (name) => navigator.sendBeacon(endpoint, JSON.stringify({ name }));
        },
        // Called with every subtree CycleWire scans: at start, for observe(), and for added content.
        scan(root) {},
        // An action is being preloaded (intent, visible, idle, load): fetch what else it
        // needs. `entry` is its registry entry, so object entries can carry options.
        preload(entry, name) {},
        // An action is about to run. The handler waits for the promise returned here,
        // which loads in parallel with the module; a rejection fails the run.
        load(entry, element, name) {},
        // Development build only: what the core schedules, fetches, skips and runs.
        trace(event) {},
        // On stop().
        stop() {},
    };
}
```

```js
start({ actions, plugins: [analytics({ endpoint: '/beacon' })] });
```

`trace` receives one object per step, with a `type`: `schedule` (a trigger or preload
was set up), `wait` (a trigger fired before its action was registered), `preload` (with
its `reason`: `intent`, a `cw-preload` value, or none for `preload()`), `import` and
`imported`, `skip` (with its `reason`: `unregistered`, `cancelled`, `once` or `busy`),
`debounce`, `queue`, `start` and `end`. The `start` and `end` of a run share its `run`
object. Only the development build (the `development` export condition, or
`dist/esm-dev/`) calls it; the production build contains none of these calls. The
`TraceEvent` type lists every field, and [`cyclewire/devtools`](devtools.md) shows it all
in a panel.

Keep plugins independent of the core's internals. Import nothing from `cyclewire` beyond
its public API, so a CDN copy and a bundled copy can never disagree.
