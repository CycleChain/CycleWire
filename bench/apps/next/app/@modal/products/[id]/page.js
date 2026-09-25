import { product } from '@scenario/catalog.js';
import QuickView from '@/app/ui/quick-view';

/**
 * The quick view on a full page load of /products/<id> (a shared link, a
 * reload, or a click before JavaScript runs): part of the page, rendered
 * open, as the reference renders it. Its Close button works without
 * JavaScript. app/products/[id] renders the shop behind it.
 */
export default async function QuickViewPage({ params }) {
    const found = product((await params).id);
    if (!found) return null;
    return (
        <dialog id="quick-view" aria-labelledby="quick-view-title" open>
            <QuickView product={found} />
        </dialog>
    );
}
