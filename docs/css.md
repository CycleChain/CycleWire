# CSS strategy

CycleWire can defer JavaScript because the server's HTML is already usable without it.
CSS is different: it is what makes that HTML look right. The CSS for anything visible
has to arrive before it paints. This guide covers what to defer and what not to.

## Don't defer the CSS of visible content

Stylesheets block rendering on purpose. Loading the CSS of server-rendered content later
shows it unstyled first (a flash of unstyled content) and then moves things around when
the styles land (layout shift, which hurts CLS). CycleWire therefore has no "lazy CSS" for
content that is already on the page, by design.

## Make the first stylesheet small

The big wins are on the server and in the build:

- **Ship only the CSS you use.** A full Bootstrap 5 build is about 230 kB of CSS (about
  23 kB brotli). A purged build of the classes you actually use is a fraction of that.
  Tailwind generates only what you use by default; for Bootstrap, run PurgeCSS or import
  only the Sass partials you need.
- **Split by page or template**, instead of one global file for the whole site.
- **Inline the critical CSS** for the first viewport, and load the rest without
  blocking:

  ```html
  <style>/* critical rules for the first viewport */</style>
  <link rel="stylesheet" href="/css/rest.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/css/rest.css"></noscript>
  ```

  Only do this when the inlined rules really cover the first viewport, on phones as
  well; otherwise it trades render-blocking for layout shift.
- **Scope stylesheets with `media`.** A `<link rel="stylesheet" media="(min-width: 60em)">`
  does not block rendering while its query does not match.
- **Skip rendering work below the fold:** `content-visibility: auto` with
  `contain-intrinsic-size` lets the browser skip layout and paint for long sections until
  they come near the viewport.

## Stylesheets that belong to an action

Some UI only exists after an action runs: a date picker, a rich text editor, a lightbox,
a map. Nothing on the page needs its CSS until then, so the CSS can wait for the action.
The optional `cyclewire/css` module (0.6 kB brotli) does this. Install its `styles()`
plugin and list the CSS with the action:

```js
import { start } from 'cyclewire';
import { styles } from 'cyclewire/css';

start({
    actions: {
        datepicker: { module: '/js/actions/datepicker.js', css: '/css/vendor/flatpickr.css' },
        editor: { module: '/js/actions/editor.js', css: ['/css/vendor/quill.css', '/css/editor.css'] },
    },
    plugins: [styles()],
});
```

The full classic-script build installs the plugin for you, so `{ "module": …, "css": … }`
works in its JSON config. Without the plugin the core ignores `css` and runs the action
unstyled; the development build warns about it.

- **Fetched with the module.** On intent (hover, focus, touch), and with `visible`,
  `idle` or `load` preloading, the stylesheets are fetched with
  `<link rel="preload" as="style">` next to the module. Speculative preloads respect
  Save-Data.
- **Applied before the handler runs.** The module and the stylesheets load in parallel,
  and the handler starts only once the styles apply, so the UI it creates is never
  unstyled.
- **Loaded once.** Each stylesheet loads once per page (or shadow root), and a matching
  stylesheet the server already rendered is reused.
- **Page styles win.** Action stylesheets are inserted **before** the page's own
  stylesheets, so your CSS wins at equal specificity, as you would expect from vendor
  CSS. To go further, put vendor CSS in a cascade layer: register a small file that
  imports it into a layer.

  ```css
  /* /css/vendor/flatpickr.layered.css */
  @import url('./flatpickr.css') layer(vendor);
  ```

- **Inside shadow roots too.** An action whose element lives in a shadow root gets its
  stylesheets inside that root, because document styles do not reach in.
- **Failures are retried.** A stylesheet that fails to load fails the run (`cw:error`,
  `onError`), just like a module that fails to load, and the next interaction retries.
- **The registry names every URL.** Stylesheet URLs, like module URLs, only ever come
  from the registry or your code, never from markup. See [security](security.md).

### Or load the CSS from the action

`css()` loads stylesheets from code. Call it from the action for stylesheets you only
know at run time, or to keep `cyclewire/css` out of your entry file altogether: the module
then downloads with the first action that imports it.

```js
// actions/datepicker.js
import { css } from 'cyclewire/css';
import flatpickr from 'flatpickr';

export async function run({ element }) {
    await css('/css/vendor/flatpickr.css', element); // into the element's document or shadow root
    flatpickr(element).open();
}
```

The trade-off: the plugin fetches the stylesheet together with the module, on intent,
while `css()` inside the action starts fetching it once the module runs.

### API

| Export | |
| --- | --- |
| `styles()` | The plugin behind `{ module, css }` entries. Pass it in `plugins` |
| `css(href, root?)` | Loads a URL or an array of URLs into `root`'s document or shadow root (default: the document). Resolves when the styles apply, rejects if one fails to load; a later call retries |

Both share one cache: each stylesheet loads once per document or shadow root, and a
matching `<link rel="stylesheet">` the page already has is reused.

## With a bundler

- **Vite:** import the CSS from the action module (`import './datepicker.css'`). Vite
  splits CSS used by async chunks into its own file and loads it before the chunk runs,
  which is exactly the behaviour above. You do not need `cyclewire/css` for it.
- **webpack:** `mini-css-extract-plugin` extracts the CSS of async chunks and loads it
  with them.
- **Either way,** do not import an action's CSS from your entry file, or it becomes part
  of the CSS every page loads up front.

## Native CSS module scripts

`import sheet from './widget.css' with { type: 'css' }` returns a `CSSStyleSheet` for
`adoptedStyleSheets`. As of 2026 it works in Chromium and Firefox (147 and later) but not
in Safari, so CycleWire uses `<link>` elements, which work everywhere.

## Style CycleWire's states

```css
[cw-pending] { cursor: progress; opacity: .7; }
[aria-busy="true"] { pointer-events: none; }

/* Reserve space for widgets that wake up later, so nothing jumps. */
[cw-trigger="visible"] { min-height: 240px; }
```

## Let HTML and CSS do the interaction when they can

Before writing an action, check whether the platform already does it without
JavaScript:
- **Accordions:** `<details name="…">`.
- **Menus and tooltips:** the Popover API (`popovertarget`), positioned with anchor
  positioning.
- **Dialogs:** `<dialog>` with Invoker Commands (`command="show-modal"`).
- **State-driven styling:** `:has()`, e.g. `form:has(:invalid) button { opacity: .5 }`.
- **Enter animations** for dialogs and popovers: `@starting-style`.
- **Scroll effects:** scroll-driven animations.

CycleWire still sees these: `cw-on-command` receives custom commands, and a
`cw-action` on a `<details>` runs on `toggle`.
