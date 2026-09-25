'use client';

import Form from 'next/form';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';

/**
 * Live search the way the Next.js Learn course teaches it: the query lives
 * in the URL, typing updates ?q= with a debounced router.replace(), and the
 * page's Server Components render the results. The course waits 300 ms; the
 * benchmark's scenario sets 200 ms for every stack that searches on the
 * server.
 *
 * The form is next/form: Enter navigates on the client, and without
 * JavaScript it is a plain GET form, which keeps the selected category in a
 * hidden field.
 */
export default function Search({ q, category }) {
    const { replace } = useRouter();
    const input = useRef(null);
    // The query this box last put in the URL, to tell its own navigations from others.
    const requested = useRef(q);

    const handleSearch = useDebouncedCallback((term) => {
        const params = new URLSearchParams();
        if (term) params.set('q', term);
        if (category) params.set('category', category);
        requested.current = term;
        replace(params.size ? `/?${params}` : '/');
    }, 200);

    // Another navigation changed the query (a category link clears it; back
    // and forward restore one): show it in the box, which is uncontrolled.
    useEffect(() => {
        if (q === requested.current) return;
        handleSearch.cancel();
        requested.current = q;
        input.current.value = q;
    }, [q, handleSearch]);

    return (
        <Form action="/" className="search" role="search" onSubmit={() => handleSearch.cancel()}>
            <label htmlFor="q">Search products</label>
            <div className="search__row">
                <input
                    ref={input}
                    id="q"
                    name="q"
                    type="search"
                    defaultValue={q}
                    autoComplete="off"
                    onChange={(event) => handleSearch(event.target.value)}
                />
                {category ? <input type="hidden" name="category" value={category} /> : null}
                <button>Search</button>
            </div>
        </Form>
    );
}
