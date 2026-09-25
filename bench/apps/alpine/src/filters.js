// The filters store: the search query and the category, shared by the search
// box, the category links, the result count and the product cards. Filtering
// happens here, over the cards the server rendered, so results update on
// every key without asking the server.
import { matches, resultText } from '../../../scenario/markup.js';

/**
 * @param {{ category: string, products: Array<{ id: string, name: string, category: string }> }} initial
 *   the category the server rendered the page with, and the products it rendered a card for
 */
export default ({ category, products }) => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
        // Filled in from the search box when Alpine starts (x-model.fill): the
        // server's query, or whatever someone typed before the script ran.
        q: '',
        category,

        /** Whether the card of a product is shown: `x-show="$store.filters.shows(id)"`. */
        shows(id) {
            return matches(byId.get(id), this);
        },

        get resultText() {
            return resultText(products.filter((product) => matches(product, this)).length);
        },

        /** The aria-current value of a category link. */
        current(category) {
            return category === this.category ? 'page' : false;
        },

        /** Choosing a category clears the search. */
        choose(category) {
            this.category = category;
            this.q = '';
        },
    };
};
