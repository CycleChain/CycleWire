import { listing, products } from '@scenario/catalog.js';
import Newsletter from '@apps/next/app/ui/newsletter.js';
import Shop from '@/app/ui/shop';

/** What the shop filters and shows of each product: no description, no image art. */
const CATALOG = products.map(listing);

/**
 * The shop's main content, copied from the next app's catalog, which renders
 * the search box, the category links and the matching products on the
 * server. Here they are one Client Component, with the result count, which
 * receives the whole catalog and filters it in the browser (app/ui/shop.js).
 * The newsletter form is the next app's.
 *
 * @param {object} props
 * @param {boolean} [props.productPage] rendered by app/products/[id], behind a quick view loaded as a page
 */
export default function Catalog({ productPage = false }) {
    return (
        <main>
            <section className="intro">
                <h1>Everyday objects, made well</h1>
                <p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
            </section>
            <Shop products={CATALOG} productPage={productPage} />
            <section className="newsletter" aria-labelledby="newsletter-title">
                <h2 id="newsletter-title">Get the Wirestore letter</h2>
                <p>New arrivals and restocks, once a month.</p>
                <Newsletter />
            </section>
        </main>
    );
}
