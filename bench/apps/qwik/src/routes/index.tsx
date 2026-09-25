import { component$, useSignal } from "@builder.io/qwik";
import { routeAction$, routeLoader$, type Cookie, type DocumentHead } from "@builder.io/qwik-city";
import { COOKIE, add, readCart } from "../../../../scenario/cart.js";
import { detail, isCategory, listing, product, products, summary } from "../../../../scenario/catalog.js";
import { INVALID_EMAIL, thanks, validEmail } from "../../../../scenario/markup.js";
import { Catalog } from "~/components/catalog/catalog";
import { Header } from "~/components/header/header";
import { Newsletter } from "~/components/newsletter/newsletter";
import { QuickView } from "~/components/quick-view/quick-view";

/** What a card shows. */
export interface Listing {
  id: string;
  name: string;
  category: string;
  price: number;
}

/** What the quick view shows. */
export interface Detail extends Listing {
  description: string;
}

/** A product without its image parameters (catalog.js is untyped JavaScript). */
const toDetail = (found: NonNullable<ReturnType<typeof product>>) => detail(found) as Detail;

/**
 * The cart this request sees. Qwik City's cookie jar is live: once an action
 * has set the cookie, the loaders that run after it in the same request read
 * the new value. readCart() parses and validates it, as it does for every stack.
 */
const cartOf = (cookie: Cookie) =>
  readCart(`${COOKIE}=${encodeURIComponent(cookie.get(COOKIE)?.value ?? "")}`);

/** The header's cart summary. Qwik City runs the loaders again after every action. */
export const useCart = routeLoader$(({ cookie }) => summary(cartOf(cookie)));

/**
 * Every product, without descriptions, for the browser to filter; the search,
 * category and product that the URL asks for (the page's state without
 * JavaScript).
 */
export const useCatalog = routeLoader$(({ url }) => {
  const category = url.searchParams.get("category") ?? "";
  const view = product(url.searchParams.get("view") ?? "");
  return {
    products: products.map((item) => listing(item) as Listing),
    q: url.searchParams.get("q") ?? "",
    category: isCategory(category) ? category : "",
    view: view ? toDetail(view) : null,
  };
});

/** Adds one of a product to the cart cookie; the loaders then run again with it. */
export const useAddToCart = routeAction$((form, { cookie, fail }) => {
  const next = add(cartOf(cookie), String(form.id ?? ""));
  if (!next) return fail(404, { message: "No such product." });
  cookie.set(COOKIE, next, { path: "/", sameSite: "lax", httpOnly: true });
});

/** Answers with the scenario's message, and a 422 for an address it rejects. */
export const useSubscribe = routeAction$((form, { fail }) => {
  const email = String(form.email ?? "").trim();
  return validEmail(email) ? { message: thanks(email) } : fail(422, { message: INVALID_EMAIL });
});

export default component$(() => {
  const cart = useCart();
  const catalog = useCatalog();
  const addToCart = useAddToCart();
  const subscribe = useSubscribe();
  // The product in ?view= is shown when the page is rendered; a card's
  // "Quick view" sets another one later.
  const initial = catalog.value.view;
  const quick = useSignal(initial);
  return (
    <>
      <Header count={cart.value.count} total={cart.value.total} />
      <main>
        <section class="intro">
          <h1>Everyday objects, made well</h1>
          <p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
        </section>
        <Catalog
          products={catalog.value.products}
          q={catalog.value.q}
          category={catalog.value.category}
          addToCart={addToCart}
          quick={quick}
        />
        <Newsletter subscribe={subscribe} />
      </main>
      <QuickView product={quick} open={initial !== null} addToCart={addToCart} />
      <footer class="bottom">
        <p>Wirestore is a benchmark scenario. Nothing here is for sale.</p>
      </footer>
    </>
  );
});

export const head: DocumentHead = {
  title: "Wirestore",
};
