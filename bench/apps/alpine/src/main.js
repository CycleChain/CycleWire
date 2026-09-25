// The page's only script: Alpine, bundled with the page's stores and
// components. Everything is registered between importing Alpine and calling
// Alpine.start(), as the installation guide asks of bundles.
import Alpine from 'alpinejs';
import cart from './cart.js';
import filters from './filters.js';
import newsletter from './newsletter.js';
import quickView from './quick-view.js';

// The state the server rendered the page from (see page.js), so the stores
// start out showing exactly what the server rendered.
const initial = JSON.parse(document.getElementById('initial-state').textContent);

Alpine.store('cart', cart(initial.cart));
Alpine.store('filters', filters(initial.filters));
Alpine.data('newsletter', newsletter);
Alpine.data('quickView', quickView);

window.Alpine = Alpine;
Alpine.start();
