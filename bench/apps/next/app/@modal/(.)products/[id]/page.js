import { notFound } from 'next/navigation';
import { product } from '@scenario/catalog.js';
import Modal from '@/app/ui/modal';
import QuickView from '@/app/ui/quick-view';

/**
 * The quick view, when a link to /products/<id> is followed inside the shop:
 * this route intercepts the navigation and renders the product in a modal
 * over the page, which stays as it was. A full page load of the same URL
 * renders app/products/[id] and app/@modal/products/[id] instead.
 */
export default async function QuickViewModal({ params }) {
    const found = product((await params).id);
    if (!found) notFound();
    return (
        <Modal>
            <QuickView product={found} />
        </Modal>
    );
}
