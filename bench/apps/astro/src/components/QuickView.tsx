// The quick view: a native <dialog>. For /?view=<id> the server renders it
// open, which works without JavaScript. Once hydrated, it opens as a modal
// whenever the catalog puts a product in the quick view store.
import { useStore } from '@nanostores/preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { categoryName, formatPrice } from '../../../../scenario/markup.js';
import { $quickView, type ProductDetail } from '../stores/quick-view';
import AddToCart from './AddToCart';

export default function QuickView({ product: rendered }: { product: ProductDetail | null }) {
    const chosen = useStore($quickView);
    const dialog = useRef<HTMLDialogElement>(null);
    const product = chosen ?? rendered;

    // Open the dialog in the same frame that renders the product.
    useLayoutEffect(() => {
        const element = dialog.current;
        if (!chosen || !element || element.matches(':modal')) return;
        if (element.open) element.close(); // rendered open by the server, not as a modal
        element.showModal();
    }, [chosen]);

    return (
        // `open` only reflects the server render; after that the dialog's own methods open and close it.
        <dialog id="quick-view" aria-labelledby="quick-view-title" open={rendered !== null} ref={dialog}>
            {product ? (
                <div class="quick-view">
                    <img src={`/images/${product.id}.webp`} alt="" width={480} height={360} />
                    <div class="quick-view__body">
                        <h2 id="quick-view-title">{product.name}</h2>
                        <p class="meta">
                            <span>{categoryName(product.category)}</span> <span class="price">{formatPrice(product.price)}</span>
                        </p>
                        <p>{product.description}</p>
                        <div class="actions">
                            <AddToCart id={product.id} />
                            <form method="dialog">
                                <button>Close</button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : null}
        </dialog>
    );
}
