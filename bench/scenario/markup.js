/**
 * The Wirestore page as markup, shared by the reference render (render.js)
 * and by any client code that wants to produce identical output. Pure
 * functions and constants only, so bundlers can take just what they use.
 *
 * Every stack must produce the same visible text as this markup (checked
 * against golden.json), keep the element ids listed in CONTRIBUTING.md, and
 * link /assets/app.css as its only stylesheet.
 */

export const CATEGORIES = [
    { id: 'lighting', name: 'Lighting' },
    { id: 'furniture', name: 'Furniture' },
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'textiles', name: 'Textiles' },
    { id: 'stationery', name: 'Stationery' },
    { id: 'audio', name: 'Audio' },
    { id: 'garden', name: 'Garden' },
];

/** How many visible cards at the top load their image eagerly. */
export const EAGER_IMAGES = 4;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for element content and quoted attribute values. */
export const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);

/** @param {number} cents */
export const formatPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

export const categoryName = (id) => CATEGORIES.find((category) => category.id === id)?.name ?? '';

/** @param {number} count */
export const resultText = (count) => (count === 0 ? 'No products found' : count === 1 ? '1 product' : `${count} products`);

export const thanks = (email) => `Thanks! We'll write to ${email}.`;
export const INVALID_EMAIL = 'Please enter a valid email address.';
export const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));

/** Lower-cased and trimmed, as every stack must compare queries. */
export const normalizeQuery = (query) => String(query ?? '').trim().toLowerCase();

/**
 * Whether a product is listed for a query and a category. Names match when
 * they contain the query, case-insensitively.
 * @param {{ name: string, category: string }} product
 * @param {{ q?: string, category?: string }} filters
 */
export function matches(product, { q = '', category = '' } = {}) {
    const query = normalizeQuery(q);
    return (!category || product.category === category) && (!query || product.name.toLowerCase().includes(query));
}

/** @param {Record<string, number>} items product id → quantity */
export function cartSummary(items, products) {
    let count = 0;
    let total = 0;
    for (const [id, quantity] of Object.entries(items)) {
        const product = products.find((candidate) => candidate.id === id);
        if (!product) continue;
        count += quantity;
        total += product.price * quantity;
    }
    return { count, total };
}

/**
 * Attribute hooks let a stack that renders with this markup add its own
 * attributes (for example cw-action) without changing anything visible.
 * Each returns a string that starts with a space, or ''.
 * @typedef {object} Attrs
 * @property {() => string} [searchForm]
 * @property {() => string} [searchInput]
 * @property {(category: string) => string} [categoryLink] '' for "All"
 * @property {(product: object) => string} [addToCart] on the add-to-cart <form>
 * @property {(product: object) => string} [quickView] on the quick view <a>
 * @property {() => string} [newsletter] on the newsletter <form>
 * @property {() => string} [cartCount]
 * @property {() => string} [cartTotal]
 * @property {() => string} [dialog]
 */

const none = () => '';
/** @param {Attrs} [attrs] */
const hooks = (attrs = {}) => new Proxy(attrs, { get: (target, key) => target[key] ?? none });

/** The add-to-cart form, in a card and in the quick view. */
export const addToCartForm = (product, attrs) =>
    `<form method="post" action="/cart"${hooks(attrs).addToCart(product)}><input type="hidden" name="id" value="${esc(product.id)}"><button>Add to cart</button></form>`;

/**
 * @param {object} product
 * @param {{ hidden?: boolean, eager?: boolean, attrs?: Attrs }} [options]
 */
export function card(product, { hidden = false, eager = false, attrs } = {}) {
    const a = hooks(attrs);
    return `<li class="card" data-product="${esc(product.id)}" data-category="${esc(product.category)}"${hidden ? ' hidden' : ''}>`
        + `<img src="/images/${esc(product.id)}.webp" alt="" width="480" height="360" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
        + `<h3>${esc(product.name)}</h3>`
        + `<p class="meta"><span>${esc(categoryName(product.category))}</span> <span class="price">${formatPrice(product.price)}</span></p>`
        + `<div class="actions">${addToCartForm(product, attrs)}<a class="quick" href="/?view=${esc(product.id)}"${a.quickView(product)}>Quick view</a></div>`
        + '</li>';
}

/** What goes inside <dialog id="quick-view"> for a product. */
export function quickView(product, attrs) {
    return '<div class="quick-view">'
        + `<img src="/images/${esc(product.id)}.webp" alt="" width="480" height="360">`
        + '<div class="quick-view__body">'
        + `<h2 id="quick-view-title">${esc(product.name)}</h2>`
        + `<p class="meta"><span>${esc(categoryName(product.category))}</span> <span class="price">${formatPrice(product.price)}</span></p>`
        + `<p>${esc(product.description)}</p>`
        + `<div class="actions">${addToCartForm(product, attrs)}<form method="dialog"><button>Close</button></form></div>`
        + '</div></div>';
}
