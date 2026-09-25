// Search as you type. Input defaults to the `restart` concurrency mode, so a
// new keystroke aborts the previous run's signal; data-cw-debounce waits for
// a pause. cyclewire/dom arrives with this module, not before.
import { html, swap } from 'cyclewire/dom';

/** @type {Promise<{ name: string, summary: string, url: string }[]> | null} */
let catalog = null;

export async function run({ element, props, signal }) {
    catalog ||= fetch(props.source)
        .then((response) => response.json())
        .catch((error) => {
            catalog = null;
            throw error;
        });
    const apis = await catalog;
    if (signal.aborted) return;

    const query = element.value.trim().toLowerCase();
    const matches = query ? apis.filter((api) => `${api.name} ${api.summary}`.toLowerCase().includes(query)) : [];
    document.getElementById(props.meta).textContent = query
        ? `${matches.length} of ${apis.length} APIs match`
        : `Type to search ${apis.length} web platform APIs.`;
    swap(document.getElementById(props.results), html`${matches.slice(0, 6).map((api) => html`
        <li>
            <a href="${api.url}" target="_blank" rel="noopener">${mark(api.name, query)}</a>
            <span>${api.summary}</span>
        </li>`)}`);
}

/** Wraps the matched part in <mark>, with every piece escaped. */
function mark(text, query) {
    const at = text.toLowerCase().indexOf(query);
    if (!query || at < 0) return text;
    return html`${text.slice(0, at)}<mark>${text.slice(at, at + query.length)}</mark>${text.slice(at + query.length)}`;
}
