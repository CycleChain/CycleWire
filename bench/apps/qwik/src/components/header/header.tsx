import { component$ } from "@builder.io/qwik";
import { formatPrice } from "../../../../../scenario/markup.js";

interface Props {
  count: number;
  /** In cents. */
  total: number;
}

/**
 * The cart summary. The page passes the cart loader's values, which Qwik City
 * refreshes after every action, so adding to the cart updates it with no code
 * here.
 */
export const Header = component$<Props>(({ count, total }) => (
  <header class="top">
    <a class="brand" href="/">
      Wirestore
    </a>
    <p class="cart">
      Cart <span id="cart-count">{count}</span> · <span id="cart-total">{formatPrice(total)}</span>
    </p>
  </header>
));
