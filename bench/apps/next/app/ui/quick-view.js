import { categoryName, formatPrice } from '@scenario/markup.js';
import AddToCart from '@/app/ui/add-to-cart';

/**
 * What the quick view dialog shows for a product, as the reference renders
 * it. A Server Component, so its Add to cart form works like the cards'.
 * The Close button is a native <form method="dialog">.
 */
export default function QuickView({ product }) {
    return (
        <div className="quick-view">
            <img src={`/images/${product.id}.webp`} alt="" width="480" height="360" />
            <div className="quick-view__body">
                <h2 id="quick-view-title">{product.name}</h2>
                <p className="meta">
                    <span>{categoryName(product.category)}</span> <span className="price">{formatPrice(product.price)}</span>
                </p>
                <p>{product.description}</p>
                <div className="actions">
                    <AddToCart id={product.id} />
                    <form method="dialog">
                        <button>Close</button>
                    </form>
                </div>
            </div>
        </div>
    );
}
