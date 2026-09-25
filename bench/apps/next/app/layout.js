import Link from 'next/link';
import { summary } from '@scenario/catalog.js';
import { formatPrice } from '@scenario/markup.js';
import { getCart } from '@/app/lib/cart';

export const metadata = {
    title: 'Wirestore',
};

/**
 * The root layout: the shop's header and footer, shared by every page. It
 * reads the cart cookie, so every request renders on the server. On
 * navigations inside the shop (filters, search) the layout is not rendered
 * again; after a Server Action that sets the cookie, it is.
 *
 * `modal` is the @modal parallel route: the quick view, when one is open.
 */
export default async function RootLayout({ children, modal }) {
    const { count, total } = summary(await getCart());
    return (
        <html lang="en">
            <head>
                {/* The benchmark's shared stylesheet, the page's only one. */}
                <link rel="stylesheet" href="/assets/app.css" />
            </head>
            <body>
                <header className="top">
                    <Link className="brand" href="/">Wirestore</Link>
                    <p className="cart">
                        Cart <span id="cart-count">{count}</span> · <span id="cart-total">{formatPrice(total)}</span>
                    </p>
                </header>
                {children}
                {modal}
                <footer className="bottom">
                    <p>Wirestore is a benchmark scenario. Nothing here is for sale.</p>
                </footer>
            </body>
        </html>
    );
}
