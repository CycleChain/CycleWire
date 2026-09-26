# Requests from markup: `cyclewire/request`

Links, forms and buttons that ask your server for HTML and put it into the page, with no
JavaScript of your own:

```html
<a href="/products?page=2" cw-action="request" cw-prevent
   cw-target="#grid" cw-select="#grid > *" cw-swap="append">More products</a>
```

`cyclewire/request` is an action. Register it once, under any name; this page calls it
`request`:

```js
import { start } from 'cyclewire';

start({ actions: { request: () => import('cyclewire/request') } });
```

Without a bundler, give its file instead:
`{ request: 'https://cdn.jsdelivr.net/npm/cyclewire@1/dist/request.min.js' }`.

Being an action has three consequences:

- **It costs nothing until it is used.** Its 3.6 kB (brotli) arrive when someone reaches
  for an element that uses it, like any other action's code. They include
  [morph](morph.md) and what applies [`<cw-stream>` messages](stream.md), so the first
  answer that needs them does not wait for more code.
- **Everything else in CycleWire applies:** `cw-on-<event>` for the event, `cw-debounce`,
  `cw-trigger`, `cw-concurrency`, `cw-pending` while a request is on its way,
  `cw:run`/`cw:done`/`cw:error`, [`cyclewire/early`](early.md) for taps before
  CycleWire starts.
- **Markup reaches it only because you registered it,** as with every action (see
  [Security](#security)).

## Examples

A form that gives way to the server's answer. The form works without JavaScript too:

```html
<form action="/newsletter" method="post" cw-action="request" cw-swap="outer">
    <input type="email" name="email" required>
    <button>Subscribe</button>
</form>
```

Search as you type. Input runs in `restart` mode, so each new request aborts the one
before:

```html
<input type="search" name="q" cw-on-input="request" cw-get="/search" cw-debounce="150" cw-target="#results">
<div id="results"></div>
```

A button that deletes its row:

```html
<tr>
    <td>Lamp</td>
    <td><button cw-action="request" cw-delete="/cart/items/42" cw-target="closest tr" cw-swap="remove">Remove</button></td>
</tr>
```

A section that loads itself as it scrolls into view:

```html
<section cw-action="request" cw-trigger="visible" cw-get="/reviews/42" cw-swap="outer">Loading reviews…</section>
```

A cart refreshed in place, keeping what the visitor typed into it:

```html
<button cw-action="request" cw-post="/cart/items?sku=lamp" cw-target="#cart" cw-swap="morph">Add to cart</button>
```

## Attributes

| Attribute | Default | |
| --- | --- | --- |
| `cw-get`, `cw-post`, `cw-put`, `cw-patch`, `cw-delete` | The element's own | The method, and the URL. Empty, or absent, it is the element's own: a submit button's `formaction`, a link's `href`, a form's `action` and `method` |
| `cw-target` | The element | Where the answer goes: a selector, looked up in the element's document or shadow root, or `closest <selector>` |
| `cw-swap` | `inner` | How: `inner`, `outer`, `before`, `after`, `prepend`, `append`, `morph`, `remove` or `none`. Add `transition` to run it in a View Transition: `cw-swap="inner transition"` |
| `cw-select` | Everything | The elements of the answer to use, by selector: a page answered in full can serve as a partial |

`morph` changes the target's children to the answer's, keeping focus and typed input
([morph](morph.md)). If the answer is one element with the target's id, the target
itself is morphed onto it.

`cw-prevent` stops a link from being followed as well. Forms and submit buttons need
nothing: CycleWire takes their submit in any case.

## What is sent

- **A form** sends its fields, and the button that submitted it.
- **An element inside a form** sends that form's fields.
- **A field on its own** sends its name and value.
- **GET** puts them in the query string. Other methods send them as the form would:
  `multipart/form-data` if its `enctype` says so, URL-encoded otherwise.
- **The CSRF token** of a `<meta name="csrf-token" content="…">` goes in an
  `X-CSRF-Token` header, which Rails and Laravel read, on every request but GET. In
  Django, send the form's `{% csrf_token %}` field, or set
  `CSRF_HEADER_NAME = 'HTTP_X_CSRF_TOKEN'`.

## What comes back

- **2xx**: the answer goes in. 204 No Content changes nothing, except that
  `cw-swap="remove"` still removes its target.
- **422**: a form sent back with its errors, shown like any answer.
- **Anything else** changes nothing. The action fails with an error, reported by
  `cw:error` and `onError` like any action's.
- **Redirects** are followed, as far as your own origin.
- **`<cw-stream>` messages** at the top level of an answer are applied: each changes the
  element it names ([stream](stream.md)), and the rest of the answer goes to the target.
  One answer can update the cart badge, the flash message and the list at once.
- **Scripts** in an answer never run: it is parsed inertly, like everything
  [`cyclewire/dom`](dom.md) parses.

## Fetch it before the click

With the [prefetch plugin](prefetch.md), an empty `cw-prefetch` fetches the element's own
URL (its `cw-get`, or a link's `href`) when the pointer or focus reaches it, and the
request takes that response:

```html
<a href="/products?page=2" cw-action="request" cw-prevent cw-prefetch cw-target="#grid" cw-select="#grid > *" cw-swap="append">More products</a>
```

Only for URLs that are safe to fetch early: a GET that changes nothing.

## On the server

Nothing needs to change: answer with the whole page, and let `cw-select` pick the part to
use. To send less, answer with only that part. A request CycleWire makes is a `fetch()`,
which browsers mark, over HTTPS, with `Sec-Fetch-Dest: empty`, where a navigation says
`document`:

```php
// Laravel
return $request->header('Sec-Fetch-Dest') === 'empty'
    ? view('products._grid', compact('products'))
    : view('products.index', compact('products'));
```

```ruby
# Rails
render request.headers['Sec-Fetch-Dest'] == 'empty' ? 'products/_grid' : 'products/index'
```

When one URL answers both ways, say so to caches with `Vary: Sec-Fetch-Dest`.

## Security

- **Your own origin only.** A URL on another origin is refused before anything is sent,
  and so is a redirect that leads to one: markup never sends the page's data to another
  site, nor puts another site's HTML into the page.
- **Markup reaches only what you registered.** Registering the request action is what lets
  markup make requests at all. Once it is registered, markup injected into the page can
  make them too, to your own origin, as it can run any other registered action (see
  [script gadgets](security.md#script-gadgets-injected-markup-can-still-call-registered-actions)).
  Keep user content inside `cw-ignore`, where nothing binds.
- **Answers are HTML your server wrote.** Escape what users wrote in them, as in any page.
  Scripts in answers never run, and with Trusted Types they pass through the `cyclewire`
  policy, as with [`html.raw()`](dom.md).

## From htmx

| htmx | CycleWire |
| --- | --- |
| `hx-get="/x"` | `cw-action="request" cw-get="/x"` |
| `hx-post`, `hx-put`, `hx-patch`, `hx-delete` | `cw-post`, `cw-put`, `cw-patch`, `cw-delete` |
| `hx-target="#x"`, `hx-target="closest tr"` | `cw-target="#x"`, `cw-target="closest tr"` |
| `hx-swap="innerHTML"`, `outerHTML`, `beforebegin`, `afterend`, `afterbegin`, `beforeend`, `delete`, `none` | `cw-swap="inner"`, `outer`, `before`, `after`, `prepend`, `append`, `remove`, `none` |
| `hx-select="#x"` | `cw-select="#x"` |
| `hx-trigger="keyup changed delay:150ms"` | `cw-on-input="request" cw-debounce="150"` |
| `hx-trigger="revealed"`, `load` | `cw-trigger="visible"`, `load` |
| `hx-swap-oob` | `<cw-stream>` messages in the answer |
| `hx-indicator` | `[cw-pending]` in CSS |
| `hx-boost` | Not built in: request actions on the links and forms you choose |
