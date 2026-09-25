// Hand-written enhancement of the reference page: one module, event
// delegation on the document, no library. It stands for the least JavaScript
// a careful developer would write for these interactions.
import { formatPrice, normalizeQuery, quickView, resultText } from '../../../scenario/markup.js';

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

async function post(url, data) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    return response.json();
}

document.addEventListener('submit', async (event) => {
    const form = /** @type {HTMLFormElement} */ (event.target);
    if (form.matches('form[action="/cart"]')) {
        event.preventDefault();
        const cart = await post('/api/cart', { id: form.elements.namedItem('id').value });
        byId('cart-count').textContent = String(cart.count);
        byId('cart-total').textContent = formatPrice(cart.total);
    } else if (form.id === 'newsletter') {
        event.preventDefault();
        const { message } = await post('/api/newsletter', { email: form.elements.namedItem('email').value });
        byId('newsletter-status').textContent = message;
    } else if (form.matches('form.search')) {
        event.preventDefault();
        filter(byId('q').value, currentCategory());
    }
});

document.addEventListener('input', (event) => {
    if (event.target.id === 'q') filter(event.target.value, currentCategory());
});

document.addEventListener('click', async (event) => {
    const link = event.target.closest?.('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.parentElement?.id === 'categories') {
        event.preventDefault();
        for (const other of link.parentElement.children) other.removeAttribute('aria-current');
        link.setAttribute('aria-current', 'page');
        byId('q').value = '';
        filter('', new URL(link.href).searchParams.get('category') ?? '');
    } else if (link.classList.contains('quick')) {
        event.preventDefault();
        const response = await fetch(`/api/products/${link.closest('[data-product]').dataset.product}`);
        const dialog = byId('quick-view');
        dialog.innerHTML = quickView(await response.json());
        dialog.showModal();
    }
});
