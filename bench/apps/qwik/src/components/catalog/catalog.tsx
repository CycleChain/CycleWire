import { component$, useComputed$, useSignal, type Signal } from "@builder.io/qwik";
import { CATEGORIES, EAGER_IMAGES, matches, resultText } from "../../../../../scenario/markup.js";
import type { Detail, Listing, useAddToCart } from "~/routes/index";
import { ProductCard } from "./product-card";

const FILTERS = [{ id: "", name: "All" }, ...CATEGORIES];

interface Props {
  products: Listing[];
  /** The search and category the page was requested with. */
  q: string;
  category: string;
  addToCart: ReturnType<typeof useAddToCart>;
  quick: Signal<Detail | null>;
}

/**
 * Search, category filters and the product list. The filters are signals and
 * the list is computed from them in the browser, so results change as you
 * type, with no request. Without JavaScript the search form and the category
 * links load the page again, and the route loader reads the same filters from
 * the URL.
 */
export const Catalog = component$<Props>((props) => {
  const query = useSignal(props.q);
  const category = useSignal(props.category);
  const visible = useComputed$(() =>
    props.products.filter((item) => matches(item, { q: query.value, category: category.value })),
  );

  return (
    <>
      <form class="search" role="search" action="/" method="get" preventdefault:submit>
        <label for="q">Search products</label>
        <div class="search__row">
          <input id="q" name="q" type="search" autocomplete="off" bind:value={query} />
          {category.value && <input type="hidden" name="category" value={category.value} />}
          <button>Search</button>
        </div>
      </form>
      <nav class="categories" id="categories" aria-label="Categories">
        {FILTERS.map(({ id, name }) => (
          <a
            key={id}
            href={id ? `/?category=${id}` : "/"}
            aria-current={category.value === id ? "page" : undefined}
            preventdefault:click
            onClick$={() => {
              category.value = id;
              query.value = "";
            }}
          >
            {name}
          </a>
        ))}
      </nav>
      <p class="count" id="result-count" role="status">
        {resultText(visible.value.length)}
      </p>
      <ul class="grid" id="products">
        {visible.value.map((item, index) => (
          <ProductCard
            key={item.id}
            id={item.id}
            name={item.name}
            category={item.category}
            price={item.price}
            eager={index < EAGER_IMAGES}
            addToCart={props.addToCart}
            quick={props.quick}
          />
        ))}
      </ul>
    </>
  );
});
