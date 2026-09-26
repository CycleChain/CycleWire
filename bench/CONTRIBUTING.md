# Adding or fixing a stack

Corrections from the people who know a stack best are the most useful contributions
this benchmark can get. If an app here is not built the way its documentation recommends,
open a pull request that changes it, or an issue that explains how. Maintainers of a stack
can also add a short response to its `bench.json` (`"response": { "text", "by", "url" }`);
the website shows it with the stack, under "How each app is built".

## What a stack must build

The page in [`scenario/render.js`](scenario/render.js), rendered on the server for every
request. It does not have to use the same markup, but people must read the same text and
the runner must find the same things. `node run.js --check --stacks=<id>` checks all of
this ([METHODOLOGY.md](METHODOLOGY.md#3-conformance)).

**Text.** The visible text must equal [`scenario/golden.json`](scenario/golden.json) in
the first state and after each interaction, whitespace aside. The easiest way to get there
is to copy the reference markup.

**Elements the runner looks for:**

| | |
| --- | --- |
| `#cart-count`, `#cart-total` | The header's item count and total, e.g. `1` and `$45.00` |
| `#q` | The search input, inside a form that shows results without JavaScript when sent |
| `#categories` | Links or buttons named "All" and each category |
| `#result-count` | "8 products", "1 product" or "No products found" |
| `#products` | The list of cards; each card has `data-product="<id>"`, a button "Add to cart" and a link or button "Quick view" |
| `#quick-view` | A `<dialog>`, open on the chosen product, with its name in `#quick-view-title` |
| `#newsletter`, `#email`, `#newsletter-status` | The form, its email input, and where the server's message appears |

**Behaviour.**

- Search matches product names that contain the query, ignoring case and surrounding
  spaces, and keeps the category. Results update as you type (`"search": "live"` in
  `bench.json`), unless the stack has no way to do that without JavaScript
  (`"search": "submit"`). A stack that asks the server for each search waits 200 ms
  after the last key before asking; one that filters in the browser need not wait.
- Choosing a category clears the search.
- Adding to the cart adds one item and updates the header. The cart lives in the `cart`
  cookie ([`scenario/cart.js`](scenario/cart.js)), so the server can render it.
- The newsletter shows the server's message: "Thanks! We'll write to <email>." or "Please
  enter a valid email address."

**Rules.**

- Link `/assets/app.css` as the only stylesheet. A framework may add up to 512 bytes of
  inline `<style>` for its own runtime.
- Use the images at `/images/<id>.webp` with the same `width`, `height` and `loading`
  values as the reference, and no image optimisation service.
- Render per request. No static export, no prerendering, no service worker, nothing from
  another origin.
- Use the build and server the stack's documentation recommends for production.

**Shared endpoints.** Served identically for every stack, by the proxy:

| | |
| --- | --- |
| `GET /assets/app.css` | The stylesheet |
| `GET /images/<id>.webp` | Product images |
| `GET /api/products?q=&category=` | `{ count, items: [{ id, name, category, price }] }` |
| `GET /api/products/<id>` | `{ id, name, category, price, description }` |
| `GET /api/cart`, `POST /api/cart` `{ id }` | `{ count, total, items }`; the POST sets the cookie |
| `POST /api/newsletter` `{ email }` | `200 { message }` or `422 { message }` |

A stack may use these, or reach the same data its own way. On the server, import
[`scenario/catalog.js`](scenario/catalog.js), [`scenario/cart.js`](scenario/cart.js) and
[`scenario/markup.js`](scenario/markup.js) rather than copying data.

## Idiomatic, and written down

Each app follows its own documentation's recommendations for production: the default
build, the recommended rendering and data-loading patterns, the recommended way to handle
forms. Where the app makes a choice (a non-default option, one pattern among several),
[`bench.json`](schema/bench.v1.json) lists it under `idioms`, with a link to the
documentation that recommends it. Results show that list next to the numbers.

Choices that only make sense for a benchmark are not allowed: disabling features to win
a metric, special-casing the runner, or loading less than a real app of this kind would.

## Adding a stack

1. Create `apps/<id>/` with a `package.json` and its lockfile (`npm install` there).
2. Add `bench.json`: `id`, `name`, `kind`, a one-line `summary`, the `build` and `start`
   commands (the server must listen on `$PORT` and `127.0.0.1`), `search`, the npm
   `packages` whose versions to record, and `idioms`. The server runs with `PORT`,
   `HOST` and `HOSTNAME` set, `NODE_ENV=production`, and `ORIGIN` set to the address the
   browser uses (`https://localhost:<port>`); the proxy also sends `X-Forwarded-Proto`,
   `X-Forwarded-Host` and the original `Host`. Builds and servers run with the usual
   telemetry switches off (`NEXT_TELEMETRY_DISABLED`, `ASTRO_TELEMETRY_DISABLED`,
   `NUXT_TELEMETRY_DISABLED`, `DO_NOT_TRACK`).
3. Run `node run.js --check --stacks=<id>` until every check passes, then
   `node run.js --stacks=static,<id> --iterations=3` to see numbers.
4. Open a pull request. CI runs the harness's tests, the conformance check and one short run.

## Changing the scenario

The scenario is shared by every stack, so changes to it are rare and deliberate. After
changing the data or the reference render, regenerate the golden text with
`node scripts/golden.js` and commit both. A change to the catalog, the stylesheet, the
images or the journeys makes earlier results incomparable: say so in the pull request.
