// Fetches the product and renders the dialog with cyclewire/dom, which
// arrives with this action.
import { html, swap } from 'cyclewire/dom';
import { categoryName, formatPrice } from '../../../../scenario/markup.js';

export async function run({ element, signal }) {
    const id = element.closest('[data-product]').dataset.product;
    const response = await fetch(`/api/products/${id}`, { signal });
    if (!response.ok) throw new Error(`The product answered ${response.status}`);
    const product = await response.json();
    const dialog = document.getElementById('quick-view');
    swap(dialog, html`<div class="quick-view"><img src="/images/${product.id}.webp" alt="" width="480" height="360"><div class="quick-view__body"><h2 id="quick-view-title">${product.name}</h2><p class="meta"><span>${categoryName(product.category)}</span> <span class="price">${formatPrice(product.price)}</span></p><p>${product.description}</p><div class="actions"><form method="post" action="/cart" data-cw-action="cart#add"><input type="hidden" name="id" value="${product.id}"><button>Add to cart</button></form><form method="dialog"><button>Close</button></form></div></div></div>`);
    dialog.showModal();
}
