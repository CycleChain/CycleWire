<!--
	The quick view: a native <dialog>, open on `product` and empty otherwise.
	Opened in the browser (shallow routing), it is a modal. When /?view=<id> is
	loaded in full, it is open the way the server renders it, which is how the
	page shows it without JavaScript.
-->
<script>
	import { refreshAll } from '$app/navigation';
	import { categoryName, formatPrice } from '$scenario/markup.js';
	import AddToCart from './AddToCart.svelte';

	/**
	 * @type {{
	 *   product: { id: string, name: string, category: string, price: number, description: string } | null,
	 *   modal: boolean,
	 *   onclose: () => void
	 * }}
	 */
	let { product, modal, onclose } = $props();

	/**
	 * A modal makes the page behind it inert, moves focus into the dialog and
	 * closes on Escape.
	 * @param {HTMLDialogElement} dialog
	 */
	const showModal = (dialog) => dialog.showModal();

	/**
	 * After a success, use:enhance re-runs the load functions with invalidateAll,
	 * which also resets page.state and so would close a quick view opened with
	 * pushState. refreshAll re-runs them and keeps the page state.
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const keepOpen = () => async ({ update }) => {
		await update({ invalidateAll: false });
		await refreshAll();
	};
</script>

{#snippet details(item)}
	<div class="quick-view">
		<img src="/images/{item.id}.webp" alt="" width="480" height="360" />
		<div class="quick-view__body">
			<h2 id="quick-view-title">{item.name}</h2>
			<p class="meta"><span>{categoryName(item.category)}</span> <span class="price">{formatPrice(item.price)}</span></p>
			<p>{item.description}</p>
			<div class="actions">
				<AddToCart id={item.id} submit={keepOpen} /><form method="dialog"><button>Close</button></form>
			</div>
		</div>
	</div>
{/snippet}

<!-- Each branch has fixed attributes, so the dialog's open state is left to the browser. -->
{#if product && modal}
	<dialog id="quick-view" aria-labelledby="quick-view-title" {@attach showModal} {onclose}>{@render details(product)}</dialog>
{:else if product}
	<dialog id="quick-view" aria-labelledby="quick-view-title" open {onclose}>{@render details(product)}</dialog>
{:else}
	<dialog id="quick-view" aria-labelledby="quick-view-title"></dialog>
{/if}
