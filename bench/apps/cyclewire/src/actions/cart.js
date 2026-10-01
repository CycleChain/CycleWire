// The header shows the cart in one place, so the action writes the new count
// and total into it, as the modules guide has it: cyclewire/signals is for
// state that several places show.
import { formatPrice } from '../../../../scenario/markup.js';

export async function add({ element, signal }) {
    const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: element.elements.namedItem('id').value }),
        signal,
    });
    if (!response.ok) throw new Error(`The cart answered ${response.status}`);
    const { count, total } = await response.json();
    /** @type {HTMLElement} */ (document.getElementById('cart-count')).textContent = String(count);
    /** @type {HTMLElement} */ (document.getElementById('cart-total')).textContent = formatPrice(total);
}
