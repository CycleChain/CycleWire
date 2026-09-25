<!-- One product in the grid, with the reference markup and image attributes. -->
<script>
	import { categoryName, formatPrice } from '$scenario/markup.js';
	import AddToCart from './AddToCart.svelte';

	/**
	 * @type {{
	 *   product: { id: string, name: string, category: string, price: number },
	 *   eager: boolean,
	 *   href: string,
	 *   onquickview: (event: MouseEvent & { currentTarget: HTMLAnchorElement }) => void
	 * }}
	 */
	let { product, eager, href, onquickview } = $props();
</script>

<li class="card" data-product={product.id} data-category={product.category}>
	<img src="/images/{product.id}.webp" alt="" width="480" height="360" loading={eager ? 'eager' : 'lazy'} decoding="async" />
	<h3>{product.name}</h3>
	<p class="meta"><span>{categoryName(product.category)}</span> <span class="price">{formatPrice(product.price)}</span></p>
	<div class="actions">
		<AddToCart id={product.id} /><a class="quick" {href} onclick={onquickview}>Quick view</a>
	</div>
</li>
