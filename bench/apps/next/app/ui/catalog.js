import Link from 'next/link';
import { search } from '@scenario/catalog.js';
import { CATEGORIES, EAGER_IMAGES, categoryName, formatPrice, resultText } from '@scenario/markup.js';
import AddToCart from '@/app/ui/add-to-cart';
import Newsletter from '@/app/ui/newsletter';
import Search from '@/app/ui/search';

/**
 * The shop's main content for a search and a category, as the reference
 * page renders it, with only the matching products. A Server Component: the
 * search box and the newsletter form are its Client Components, besides
 * next/link's links.
 */
export default function Catalog({ q, category }) {
    const found = search({ q, category });
    return (
        <main>
            <section className="intro">
                <h1>Everyday objects, made well</h1>
                <p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
            </section>
            <Search q={q} category={category} />
            <nav className="categories" id="categories" aria-label="Categories">
                {[{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => (
                    <Link key={name} href={id ? `/?category=${id}` : '/'} aria-current={id === category ? 'page' : undefined}>
                        {name}
                    </Link>
                ))}
            </nav>
            <p className="count" id="result-count" role="status">{resultText(found.length)}</p>
            <ul className="grid" id="products">
                {found.map((product, index) => (
                    <li key={product.id} className="card" data-product={product.id} data-category={product.category}>
                        <img
                            src={`/images/${product.id}.webp`}
                            alt=""
                            width="480"
                            height="360"
                            loading={index < EAGER_IMAGES ? 'eager' : 'lazy'}
                            decoding="async"
                        />
                        <h3>{product.name}</h3>
                        <p className="meta">
                            <span>{categoryName(product.category)}</span> <span className="price">{formatPrice(product.price)}</span>
                        </p>
                        <div className="actions">
                            <AddToCart id={product.id} />
                            {/* Opens the quick view: app/@modal/(.)products/[id] intercepts the navigation. */}
                            <Link className="quick" href={`/products/${product.id}`}>Quick view</Link>
                        </div>
                    </li>
                ))}
            </ul>
            <section className="newsletter" aria-labelledby="newsletter-title">
                <h2 id="newsletter-title">Get the Wirestore letter</h2>
                <p>New arrivals and restocks, once a month.</p>
                <Newsletter />
            </section>
        </main>
    );
}
