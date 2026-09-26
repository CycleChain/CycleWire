// GET /: loads what the page renders and passes it on with next(), which
// renders +page.marko with it as $global.data. The query string describes the
// page (?q=, ?category=, ?view=, and the newsletter's result), and the cart
// comes from the `cart` cookie, so every request renders its own page.
import { readCart } from "../../../../scenario/cart.js";
import { detail, listing, product, products, summary } from "../../../../scenario/catalog.js";
import { INVALID_EMAIL, thanks } from "../../../../scenario/markup.js";
import { stateFrom } from "../../../../scenario/render.js";

export const GET = Run.GET((ctx, next) => {
  const state = stateFrom(ctx.url, readCart(ctx.request.headers.get("cookie") ?? undefined));
  const shown = product(state.view);
  return next({
    // Every product without its description: the cards, the search and the
    // categories need no more.
    products: products.map(listing),
    cart: summary(state.cart),
    filters: { q: state.q, category: state.category },
    // The quick view's product, with its description, when the URL asks for it.
    quickView: shown && detail(shown),
    newsletter: state.subscribed ? thanks(state.subscribed) : state.invalidEmail ? INVALID_EMAIL : "",
  });
});
