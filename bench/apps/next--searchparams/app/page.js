import Catalog from '@/app/ui/catalog';

/**
 * The shop. The URL is the state, ?q= the search and ?category= the filter,
 * as in the next app, whose page reads searchParams and filters on the
 * server. This one does not read them: the shop's Client Component does,
 * with useSearchParams(), in the browser and on the server. The root layout
 * reads the cart cookie, so the route renders per request, and on such a
 * route useSearchParams() holds the request's search params during the
 * server render (app/ui/shop.js).
 */
export default function Page() {
    return <Catalog />;
}
