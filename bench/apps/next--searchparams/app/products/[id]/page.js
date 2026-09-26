import { notFound } from 'next/navigation';
import { product } from '@scenario/catalog.js';
import Catalog from '@/app/ui/catalog';

/**
 * /products/<id> on a full page load: the whole shop, with the product's
 * quick view open over it (app/@modal/products/[id]). Copied from the next
 * app, whose page renders that app's catalog, which filters on the server;
 * this one renders this app's, and tells it that it is on a product's page,
 * where a filter navigates to the shop's page instead of changing the URL in
 * place (app/ui/shop.js).
 */
export default async function ProductPage({ params }) {
    if (!product((await params).id)) notFound();
    return <Catalog productPage />;
}
