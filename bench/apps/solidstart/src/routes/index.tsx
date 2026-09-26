import { createAsync, useNavigate, useSearchParams, type RouteDefinition } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { CATEGORIES, EAGER_IMAGES, matches, resultText } from "#scenario/markup.js";
import NewsletterForm from "~/components/NewsletterForm";
import ProductCard from "~/components/ProductCard";
import QuickView from "~/components/QuickView";
import { getProduct, getProducts } from "~/lib/api";

// The shop: the search, the categories, the product grid, the newsletter and
// the quick view. The URL holds the state (?q=, ?category=, ?view=): the
// server renders it, and without JavaScript the links and the search form
// load it. In the browser the router changes it, and the page filters the
// products it already has.

const CATEGORY_LINKS = [{ id: "", name: "All" }, ...CATEGORIES];

/** A search parameter's value: the first one when it is repeated, '' when it is missing. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** An address on this page with these search parameters, leaving out the empty ones. */
function address(params: Record<string, string>) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
  return search ? `/?${search}` : "/";
}

// Starts the page's queries before it renders, and, when a link to this page
// is hovered or touched, the quick view's product before the navigation.
export const route = {
  preload({ location }) {
    getProducts();
    const view = first(location.query.view);
    if (view) getProduct(view);
  },
} satisfies RouteDefinition;

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const q = () => first(params.q);
  const category = () => {
    const id = first(params.category);
    return CATEGORIES.some(candidate => candidate.id === id) ? id : "";
  };
  const view = () => first(params.view);

  // Every product without its description, loaded with the page; the search
  // and the categories filter it in the browser without asking the server.
  const products = createAsync(() => getProducts(), { initialValue: [], deferStream: true });
  const visible = createMemo(() => products().filter(product => matches(product, { q: q(), category: category() })));

  // The quick view's product, with its description: fetched when ?view= changes,
  // or with the page when it is loaded with ?view=<id>.
  const quickView = createAsync(
    async () => {
      const id = view();
      return id ? getProduct(id) : null;
    },
    { deferStream: true },
  );

  /**
   * The quick view closed (its Close button, or Escape): back to the address
   * without ?view=. If the page opened it, that is the previous history entry,
   * so Back and Forward stay in step with the screen; on a page loaded with
   * ?view=, the address is replaced.
   */
  function closeQuickView(modal: boolean) {
    if (!view()) return; // a navigation (Back) closed it
    if (modal) navigate(-1);
    else navigate(address({ q: q(), category: category() }), { replace: true, scroll: false });
  }

  return (
    <>
      <main>
        <section class="intro">
          <h1>Everyday objects, made well</h1>
          <p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
        </section>
        {/* Without JavaScript, a GET form that loads the page with the results. With it,
            every input replaces ?q= in the URL (keeping the category, without a history
            entry per key), and the results follow. */}
        <form class="search" role="search" action="/" method="get" onSubmit={event => event.preventDefault()}>
          <label for="q">Search products</label>
          <div class="search__row">
            <input
              id="q"
              name="q"
              type="search"
              value={q()}
              autocomplete="off"
              onInput={event => setParams({ q: event.currentTarget.value }, { replace: true })}
            />
            <Show when={category()}>
              <input type="hidden" name="category" value={category()} />
            </Show>
            <button>Search</button>
          </div>
        </form>
        {/* Plain links, which the router follows in the page. They leave ?q= out, so
            choosing a category clears the search. */}
        <nav class="categories" id="categories" aria-label="Categories">
          <For each={CATEGORY_LINKS}>
            {link => (
              <a href={link.id ? `/?category=${link.id}` : "/"} aria-current={link.id === category() ? "page" : undefined}>
                {link.name}
              </a>
            )}
          </For>
        </nav>
        <p class="count" id="result-count" role="status">{resultText(visible().length)}</p>
        <ul class="grid" id="products">
          <For each={visible()}>
            {(product, index) => (
              <ProductCard
                product={product}
                eager={index() < EAGER_IMAGES}
                quickView={address({ q: q(), category: category(), view: product.id })}
              />
            )}
          </For>
        </ul>
        <NewsletterForm />
      </main>
      <QuickView product={quickView()} onClose={closeQuickView} />
    </>
  );
}
