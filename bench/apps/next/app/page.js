import { isCategory } from '@scenario/catalog.js';
import Catalog from '@/app/ui/catalog';

/** A search param's value: the first one when it is repeated, '' when it is missing. */
const first = (value) => (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * The shop. The URL is the state: ?q= is the search and ?category= the
 * filter, read from searchParams and rendered on the server per request.
 */
export default async function Page({ searchParams }) {
    const params = await searchParams;
    const category = first(params.category);
    return <Catalog q={first(params.q)} category={isCategory(category) ? category : ''} />;
}
