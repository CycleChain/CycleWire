'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, EAGER_IMAGES, categoryName, formatPrice, matches, resultText } from '@scenario/markup.js';
import AddToCart from '@apps/next/app/ui/add-to-cart.js';

/** The shop's URL for a search and a category, with the parameters in the order the search form sends them. */
function shopUrl(q, category) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    return params.size ? `/?${params}` : '/';
}

/** A click to leave to the browser: not the main button, or with a key that opens the link elsewhere. */
const forBrowser = (event) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/**
 * The search box, the category links, the result count and the product
 * list, filtered in the browser from the catalog the page passes in, the way
 * the Next.js docs show for the native History API. The URL holds the state
 * and useSearchParams() reads it: choosing a category adds a history entry
 * with window.history.pushState(), typing replaces the current one with
 * window.history.replaceState(), and Next.js brings useSearchParams() up to
 * date with both, without asking the server, so the list follows at once,
 * and Back and Forward bring it back.
 *
 * On the server, useSearchParams() holds the request's search params, so
 * every URL renders its own state, and without JavaScript the links navigate
 * and the search box is a GET form, as in the next app.
 *
 * @param {object} props
 * @param {Array<{ id: string, name: string, category: string, price: number }>} props.products
 * @param {boolean} [props.productPage] rendered behind a quick view loaded as a page, app/products/[id]
 */
export default function Shop({ products, productPage = false }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const onShop = usePathname() === '/';
    // A quick view opened over the shop has a URL of its own,
    // /products/<id>, without the shop's search params: behind it the list
    // stays as it was (the next app's page keeps the props it was rendered
    // with).
    const [shown, setShown] = useState(() => searchParams.toString());
    const search = onShop ? searchParams.toString() : shown;
    if (search !== shown) setShown(search);

    const params = new URLSearchParams(search);
    const q = params.get('q') ?? '';
    const chosen = params.get('category') ?? '';
    const category = CATEGORIES.some(({ id }) => id === chosen) ? chosen : '';
    const found = products.filter((product) => matches(product, { q, category }));

    const box = useRef(null);
    // The box is uncontrolled, as in the next app, so a render never holds up
    // typing. Show the query when something else changes it: a category
    // clears it, Back and Forward bring one back. The address bar is updated
    // at once and useSearchParams() in the render that follows, so while the
    // two differ the box is ahead, and is left alone.
    useEffect(() => {
        const inAddressBar = new URLSearchParams(window.location.search).get('q') ?? '';
        if (box.current.value !== q && q === inAddressBar) box.current.value = q;
    }, [q]);

    const searching = useRef(undefined);
    useEffect(() => () => clearTimeout(searching.current), []);

    /**
     * Puts a filter in the URL, in place, with the History API: pushState()
     * for a category, replaceState() for the search. On a product's page, a
     * quick view loaded as a page, the route on screen is the product's, and
     * the History API would keep it, dialog and all, under the shop's URL, for
     * Back to bring back; there a filter navigates to the shop's page as the
     * next app's do, and the dialog goes (app/@modal/page.js). Such a search
     * asks the server, so it waits 200 ms after the last key, as there.
     */
    const show = (url, { replace = false } = {}) => {
        if (!productPage) {
            window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
            return;
        }
        clearTimeout(searching.current);
        if (replace) searching.current = setTimeout(() => router.replace(url), 200);
        else router.push(url);
    };

    const choose = (id) => (event) => {
        if (forBrowser(event)) return;
        event.preventDefault();
        const url = shopUrl('', id);
        // A link to the page already shown adds no history entry, as with a navigation.
        if (url !== `${window.location.pathname}${window.location.search}`) show(url);
    };

    return (
        <>
            {/* Without JavaScript a GET form. With it, the results already follow the box, so sending it does nothing more. */}
            <form action="/" className="search" role="search" onSubmit={(event) => event.preventDefault()}>
                <label htmlFor="q">Search products</label>
                <div className="search__row">
                    <input
                        ref={box}
                        id="q"
                        name="q"
                        type="search"
                        defaultValue={q}
                        autoComplete="off"
                        onChange={(event) => show(shopUrl(event.target.value, category), { replace: true })}
                    />
                    {category ? <input type="hidden" name="category" value={category} /> : null}
                    <button>Search</button>
                </div>
            </form>
            <nav className="categories" id="categories" aria-label="Categories">
                {[{ id: '', name: 'All' }, ...CATEGORIES].map(({ id, name }) => (
                    <a key={name} href={shopUrl('', id)} aria-current={id === category ? 'page' : undefined} onClick={choose(id)}>
                        {name}
                    </a>
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
                            {/* The next app's form, which calls the addToCart Server Action, here from a Client Component. */}
                            <AddToCart id={product.id} />
                            {/* Opens the quick view: app/@modal/(.)products/[id] intercepts the navigation. */}
                            <Link className="quick" href={`/products/${product.id}`}>Quick view</Link>
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}
