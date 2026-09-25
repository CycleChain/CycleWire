// The header's cart summary. It renders the cart the server read from the
// cookie, then follows the cart store once the page changes the cart.
import { useStore } from '@nanostores/preact';
import { formatPrice } from '../../../../scenario/markup.js';
import { $cart, type CartSummary as Summary } from '../stores/cart';

export default function CartSummary(rendered: Summary) {
    const { count, total } = useStore($cart) ?? rendered;
    return (
        <p class="cart">
            Cart <span id="cart-count">{count}</span> · <span id="cart-total">{formatPrice(total)}</span>
        </p>
    );
}
