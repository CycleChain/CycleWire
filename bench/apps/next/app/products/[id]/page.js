import { notFound } from 'next/navigation';
import { product } from '@scenario/catalog.js';
import Catalog from '@/app/ui/catalog';

/**
 * /products/<id> on a full page load: the whole shop, with the product's
 * quick view open over it (app/@modal/products/[id]), which is how the
 * reference page shows a quick view without JavaScript.
 */
export default async function ProductPage({ params }) {
    if (!product((await params).id)) notFound();
    return <Catalog q="" category="" />;
}
