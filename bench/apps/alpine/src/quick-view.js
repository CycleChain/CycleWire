// The quick view component: `x-data="quickView(product)"` on the <dialog>.
// A card's "Quick view" link dispatches a `quick-view` event with the product
// id; the dialog, listening on the window, fetches the product from the
// shared API, and its bound elements show it as the dialog opens.
import { categoryName, formatPrice } from '../../../scenario/markup.js';

/**
 * @typedef {{ id: string, name: string, category: string, price: number, description: string }} Product
 * @param {Product | null} product the product the server opened the dialog on, if any
 */
export default (product = null) => ({
    product,

    get name() {
        return this.product?.name ?? '';
    },
    get category() {
        return this.product ? categoryName(this.product.category) : '';
    },
    get price() {
        return this.product ? formatPrice(this.product.price) : '';
    },
    get description() {
        return this.product?.description ?? '';
    },
    get image() {
        return this.product ? `/images/${this.product.id}.webp` : null;
    },

    /** `@quick-view.window="show($event.detail.id)"` on the dialog. */
    async show(id) {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error(`The product answered ${response.status}`);
        this.product = await response.json();
        // Alpine updates the bound elements in a microtask, before the next
        // frame is painted, so the dialog never shows the previous product.
        const dialog = this.$root;
        if (!dialog.open) dialog.showModal();
    },
});
