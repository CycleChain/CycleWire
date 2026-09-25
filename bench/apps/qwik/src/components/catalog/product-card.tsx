import { component$, type Signal } from "@builder.io/qwik";
import { Form, server$ } from "@builder.io/qwik-city";
import { detail, product } from "../../../../../scenario/catalog.js";
import { categoryName, formatPrice } from "../../../../../scenario/markup.js";
import type { Detail, useAddToCart } from "~/routes/index";

/**
 * The quick view's product, asked of the server when "Quick view" is tapped:
 * server$ is Qwik City's RPC, and the client build keeps only the call.
 */
export const getProduct = server$((id: string) => {
  const found = product(id);
  return found ? (detail(found) as Detail) : null;
});

interface Props {
  id: string;
  name: string;
  category: string;
  price: number;
  /** The first cards on screen load their image eagerly, the rest lazily. */
  eager: boolean;
  addToCart: ReturnType<typeof useAddToCart>;
  quick: Signal<Detail | null>;
}

/**
 * One product. "Add to cart" is a <Form> bound to the route action: it posts
 * the form without JavaScript, and with it Qwik City submits it and then
 * refreshes the route loaders. "Quick view" is a link to ?view=, which renders
 * the dialog open; with JavaScript it asks the server for the product instead
 * and the quick view opens as a modal.
 */
export const ProductCard = component$<Props>(({ id, name, category, price, eager, addToCart, quick }) => (
  <li class="card" data-product={id} data-category={category}>
    <img
      src={`/images/${id}.webp`}
      alt=""
      width={480}
      height={360}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
    <h3>{name}</h3>
    <p class="meta">
      <span>{categoryName(category)}</span> <span class="price">{formatPrice(price)}</span>
    </p>
    <div class="actions">
      <Form action={addToCart}>
        <input type="hidden" name="id" value={id} />
        <button>Add to cart</button>
      </Form>
      <a
        class="quick"
        href={`/?view=${id}`}
        preventdefault:click
        onClick$={async () => {
          quick.value = await getProduct(id);
        }}
      >
        Quick view
      </a>
    </div>
  </li>
));
