import { createAsync } from "@solidjs/router";
import { formatPrice } from "#scenario/markup.js";
import { getCart } from "~/lib/api";

/**
 * The header's cart: the server renders it from the `cart` cookie, and adding
 * to the cart revalidates it (see addToCart in lib/api.ts).
 */
export default function CartSummary() {
  const cart = createAsync(() => getCart(), { deferStream: true });
  return (
    <p class="cart">
      Cart <span id="cart-count">{cart()?.count ?? 0}</span> · <span id="cart-total">{formatPrice(cart()?.total ?? 0)}</span>
    </p>
  );
}
