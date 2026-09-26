# Popular libraries

**CycleWire works with them.** It renders nothing and does not own the DOM; it decides
*when* code runs. A library that works on DOM elements works from an action, and the
action decides when the library loads: on a field's first focus, when an element scrolls
into view, on submit. Until then the page downloads nothing for it.

Runnable example: [examples/libraries](../examples/libraries/), a server-rendered
dashboard with the four libraries below, also
[live](https://cyclechain.github.io/CycleWire/examples/libraries/). The browser tests run
it in Chromium, Firefox and WebKit ([`libraries.spec.js`](../test/e2e/libraries.spec.js)).

| Library | Pattern | In the test suite |
| --- | --- | --- |
| [Flatpickr](#flatpickr-and-other-inputs) | A date picker created on the field's first focus, stylesheet included | Yes |
| [SweetAlert2](#sweetalert2-and-other-dialogs) | A confirmation before a destructive submit | Yes |
| [DataTables](#datatables-and-other-table-enhancers) | A server-rendered table enhanced when it scrolls into view; row actions survive paging and search | Yes |
| [jQuery](#jquery) | Existing jQuery code next to CycleWire: shared events, live inserted markup | Yes |
| [Others](#other-libraries) | Charts, sliders, maps, editors, lightboxes, Alpine.js | No; same patterns |

## Rules for every library

1. **Import the library in the action, not in your entry file.** The bundler then gives it
   a chunk of its own, downloaded the first time the action runs. `loaded()` shows which
   actions have loaded so far.
2. **Keep the server HTML useful without it:** a text field that takes a typed date, a
   plain table, a form that posts. The library improves it when it arrives.
3. **Set it up once.** Use `cw-once` for setup bound to an event. Triggers
   (`visible`, `idle`, `load`) run once per element anyway.
4. **Ship its CSS with it:** `{ module, css }` entries with the `styles()` plugin of
   [`cyclewire/css`](css.md), `css()` from the action, or your bundler's CSS splitting.
5. **Reserve space** for widgets that start later (`min-height`, `aspect-ratio`), so
   nothing jumps when they do.
6. **Clean up** with the library's `destroy()` if its element can be removed while the
   page lives. The [`removed()` helper](frameworks.md#unmount-when-the-island-leaves) tells
   you when.

## Flatpickr, and other inputs

```html
<input name="due" placeholder="YYYY-MM-DD" autocomplete="off" cw-on-focusin="datepicker" cw-once>
```

```js
import { start } from 'cyclewire';
import { styles } from 'cyclewire/css';

start({
    actions: {
        datepicker: { module: () => import('./actions/datepicker.js'), css: '/css/vendor/flatpickr.min.css' },
    },
    plugins: [styles()],
});
```

```js
// actions/datepicker.js
import flatpickr from 'flatpickr';

export function run({ element }) {
    // The focus that woke this action up has already happened, so open it now.
    flatpickr(element, { dateFormat: 'Y-m-d' }).open();
}
```

Flatpickr and its stylesheet download when someone focuses the field, or as their pointer
heads for it, thanks to intent preloading. The same pattern fits Choices.js, Tom Select,
Tagify and input masks: create the widget on the first focus.

## SweetAlert2, and other dialogs

```html
<form method="post" action="/projects/42/delete" cw-action="confirm"
      cw-props='{"title": "Delete project Atlas?", "text": "This cannot be undone.", "confirm": "Delete"}'>
    <button>Delete project</button>
</form>
```

```js
// actions/confirm.js
import Swal from 'sweetalert2';

export async function run({ element, props }) {
    const { isConfirmed } = await Swal.fire({
        title: props.title,
        text: props.text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: props.confirm,
        focusCancel: true,
    });
    if (isConfirmed) element.submit();
}
```

- Without JavaScript the form still posts, just without the question.
- `element.submit()` sends the form without firing another submit event, so the user is
  not asked twice. `requestSubmit()` would run the action again.
- To stay on the page instead, send the form with `fetch()` and update the page. The
  example does that, because its live demo runs on a static host.
- While the dialog is open, more submits are dropped: `drop` is the default concurrency
  mode.
- SweetAlert2's default build adds its stylesheet in a `<style>` element. If your CSP does
  not allow that, import `sweetalert2/dist/sweetalert2.esm.js` instead and load
  `sweetalert2/dist/sweetalert2.min.css` through `{ module, css }`.

Toast libraries (Notyf, Toastify) work the same way: call them from an action, or from a
`cw:done` listener.

## DataTables, and other table enhancers

```html
<table cw-action="table" cw-trigger="visible">
    <thead><tr><th>Project</th><th></th></tr></thead>
    <tbody>
        <!-- every row rendered on the server, each with its own button -->
        <tr><td>Granite</td><td><button cw-action="projects#archive" cw-props='{"id": "p7"}'>Archive</button></td></tr>
    </tbody>
</table>
```

```js
start({
    actions: {
        table: { module: () => import('./actions/table.js'), css: '/css/vendor/dataTables.dataTables.min.css' },
        projects: () => import('./actions/projects.js'),
    },
    plugins: [styles()],
});
```

```js
// actions/table.js
import DataTable from 'datatables.net-dt';

export function run({ element }) {
    new DataTable(element, { pageLength: 10 });
}
```

- The table is complete and readable before DataTables arrives, and search engines see
  every row.
- DataTables moves rows in and out of the page as you sort, search and page. CycleWire's
  listener is delegated, so buttons in those rows keep working with no re-binding after a
  redraw, the usual trouble with a listener per row.
- DataTables 3, the version in the test suite, does not need jQuery. DataTables 1 and 2
  do: import jQuery in the action and call `$(element).DataTable()`.

List.js, Tabulator and Grid.js fit the same pattern.

## jQuery

CycleWire and jQuery work side by side, so a page can adopt CycleWire without rewriting
its jQuery code first.

- **Markup that jQuery inserts is live.** After `$('#list').append('<button
  cw-action="…">')`, delegation handles the button's events and the
  MutationObserver activates any trigger in it. There is nothing to wire up.
- **jQuery hears CycleWire's events:**

  ```js
  $(document).on('cw:done', (event) => {
      const { action, result } = event.originalEvent.detail; // jQuery 4 also has event.detail
  });
  ```

- **`.trigger()` reaches CycleWire only when it ends in a native method.**
  `$(button).trigger('click')` ends in the button's own `click()`, a real event that
  CycleWire handles. `.trigger('change')`, `.trigger('input')` and custom events stay
  inside jQuery; dispatch a real event when CycleWire should see it:
  `element.dispatchEvent(new Event('change', { bubbles: true }))`.
- **`$(form).trigger('submit')` bypasses CycleWire.** It ends in `form.submit()`, which
  skips the submit event, and with it any action on the form, such as a confirmation.
  Call `form.requestSubmit()` instead.
- **Plugins that fire jQuery-only events**, like Select2's `change`, never reach
  `cw-on-change`. Listen with jQuery and run the action yourself:

  ```js
  import { run } from 'cyclewire';

  $('#country').on('change', function () {
      run('address#country', this);
  });
  ```

## Other libraries

These are not part of the test suite. The patterns are the ones the tested examples use.

| Library | Pattern |
| --- | --- |
| Chart.js, ApexCharts, ECharts | A `visible` trigger on a placeholder with reserved height; data from `cw-props` or a fetch |
| Swiper, Splide, Embla | A `visible` trigger; render the slides as a scrollable row, so they work before the library |
| Leaflet, Mapbox GL | A `visible` trigger on a static map image of the same size, the map's CSS through `{ module, css }` |
| GLightbox, PhotoSwipe | Links to the full images, which work without JavaScript, with `cw-prevent` so the action opens the lightbox instead |
| Quill, TinyMCE, CKEditor | Create the editor on the first focus of a `<textarea>`, which still submits without it |
| Alpine.js | Both read their own attributes (`x-*`, `cw-*`), so they share a page. An Alpine handler with `.stop` hides the event from CycleWire, as in [frameworks](frameworks.md#events-who-runs-first) |
| htmx, Turbo | See [integrations](integrations.md#htmx-and-turbo) |
| Bootstrap | [`cyclewire/bootstrap`](plugins.md) for the data API, or Bootstrap's own JavaScript |
| Lodash, Day.js, Axios | Import them in the actions that use them |
