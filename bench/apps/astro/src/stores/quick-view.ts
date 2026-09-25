// The product in the quick view, shared between the catalog (where people
// ask for it) and the dialog island that shows it.
import { actions } from 'astro:actions';
import { atom } from 'nanostores';

export interface ProductDetail {
    id: string;
    name: string;
    category: string;
    /** In cents. */
    price: number;
    description: string;
}

/** The last product someone asked to see. Each request sets a new object, so the dialog opens again for the same product. */
export const $quickView = atom<ProductDetail | null>(null);

/** Fetches a product with the getProduct action and puts it in the quick view. */
export async function openQuickView(id: string) {
    const { data, error } = await actions.getProduct({ id });
    if (error) return;
    $quickView.set(data);
}
