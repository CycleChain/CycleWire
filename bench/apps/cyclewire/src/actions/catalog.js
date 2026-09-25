// Search and category filters show and hide the cards the server rendered.
import { normalizeQuery, resultText } from '../../../../scenario/markup.js';

const byId = (id) => document.getElementById(id);

function currentCategory() {
    const link = byId('categories').querySelector('[aria-current="page"]');
    return link ? new URL(link.href).searchParams.get('category') ?? '' : '';
}

function filter(query, category) {
    const q = normalizeQuery(query);
    let count = 0;
    for (const card of byId('products').children) {
        const show = (!category || card.dataset.category === category)
            && (!q || card.querySelector('h3').textContent.toLowerCase().includes(q));
        card.hidden = !show;
        if (show) count++;
    }
    byId('result-count').textContent = resultText(count);
}

/** Bound to the search form: on submit and on every input. */
export function search({ element }) {
    filter(element.elements.namedItem('q').value, currentCategory());
}

/** Bound to each category link. */
export function category({ element }) {
    for (const link of element.parentElement.children) link.removeAttribute('aria-current');
    element.setAttribute('aria-current', 'page');
    byId('q').value = '';
    filter('', new URL(element.href).searchParams.get('category') ?? '');
}
