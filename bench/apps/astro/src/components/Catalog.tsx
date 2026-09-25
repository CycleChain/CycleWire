// Search, category filters, the result count and the product cards. They
// share the filters, so they are one island. It filters the products the page
// passed in, in the browser, as people type or pick a category. Without
// JavaScript the same form and links load the filtered page from the server.
import type { TargetedMouseEvent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, EAGER_IMAGES, categoryName, formatPrice, matches, resultText } from '../../../../scenario/markup.js';
import { openQuickView } from '../stores/quick-view';
import AddToCart from './AddToCart';

export interface Listing {
    id: string;
    name: string;
    category: string;
    /** In cents. */
    price: number;
}

interface Props {
    products: Listing[];
    /** The search the URL asked for. */
    q: string;
    /** The category the URL asked for, or '' for all. */
    category: string;
}

const LINKS = [{ id: '', name: 'All' }, ...CATEGORIES];

/** A plain click is handled in the page; a modified one (new tab, new window) follows the link. */
const plainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export default function Catalog({ products, q, category: requested }: Props) {
    const [query, setQuery] = useState(q);
    const [category, setCategory] = useState(requested);
    const search = useRef<HTMLInputElement>(null);

    // Text typed before the island hydrated is in the input but not yet in state.
    useEffect(() => {
        const typed = search.current?.value ?? '';
        if (typed !== query) setQuery(typed);
    }, []);

    const visible = products.filter((product) => matches(product, { q: query, category }));
    const eager = new Set(visible.slice(0, EAGER_IMAGES).map((product) => product.id));

    function choose(event: TargetedMouseEvent<HTMLAnchorElement>, id: string) {
        if (!plainClick(event)) return;
        event.preventDefault();
        setCategory(id);
        setQuery('');
    }

    return (
        <>
            <form class="search" role="search" action="/" method="get" onSubmit={(event) => event.preventDefault()}>
                <label for="q">Search products</label>
                <div class="search__row">
                    <input
                        id="q"
                        name="q"
                        type="search"
                        value={query}
                        autocomplete="off"
                        ref={search}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                    {category ? <input type="hidden" name="category" value={category} /> : null}
                    <button>Search</button>
                </div>
            </form>
            <nav class="categories" id="categories" aria-label="Categories">
                {LINKS.map(({ id, name }) => (
                    <a
                        key={id}
                        href={id ? `/?category=${id}` : '/'}
                        aria-current={id === category ? 'page' : undefined}
                        onClick={(event) => choose(event, id)}
                    >
                        {name}
                    </a>
                ))}
            </nav>
            <p class="count" id="result-count" role="status">{resultText(visible.length)}</p>
            <ul class="grid" id="products">
                {visible.map((product) => <Card key={product.id} product={product} eager={eager.has(product.id)} />)}
            </ul>
        </>
    );
}

/** A product card. The first cards on screen load their image eagerly, the rest lazily. */
function Card({ product, eager }: { product: Listing; eager: boolean }) {
    function quickView(event: TargetedMouseEvent<HTMLAnchorElement>) {
        if (!plainClick(event)) return;
        event.preventDefault();
        openQuickView(product.id);
    }

    return (
        <li class="card" data-product={product.id} data-category={product.category}>
            <img src={`/images/${product.id}.webp`} alt="" width={480} height={360} loading={eager ? 'eager' : 'lazy'} decoding="async" />
            <h3>{product.name}</h3>
            <p class="meta">
                <span>{categoryName(product.category)}</span> <span class="price">{formatPrice(product.price)}</span>
            </p>
            <div class="actions">
                <AddToCart id={product.id} />
                <a class="quick" href={`/?view=${product.id}`} onClick={quickView}>Quick view</a>
            </div>
        </li>
    );
}
