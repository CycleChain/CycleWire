<!--
	The Wirestore page, with the reference markup. The server renders it for
	every request; the browser hydrates it and takes over its links and forms.
-->
<script>
	import { enhance } from '$app/forms';
	import { goto, preloadData, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import ProductCard from '$lib/ProductCard.svelte';
	import QuickView from '$lib/QuickView.svelte';
	import { CATEGORIES, EAGER_IMAGES, formatPrice, matches, resultText } from '$scenario/markup.js';

	/** @type {import('./$types').PageProps} */
	let { data, form } = $props();

	// The search and the category are filters, so they live in the URL: the
	// server renders them, links and the search form set them, and the browser
	// filters the products the page already has when they change.
	const q = $derived(page.url.searchParams.get('q') ?? '');
	const category = $derived.by(() => {
		const id = page.url.searchParams.get('category') ?? '';
		return CATEGORIES.some((candidate) => candidate.id === id) ? id : '';
	});
	const visible = $derived(data.products.filter((product) => matches(product, { q, category })));

	// Opened in the browser with pushState, or loaded in full as /?view=<id>.
	const quickView = $derived(page.state.quickView ?? data.quickView);

	/**
	 * This page's address with the quick view on a product, or on none. It keeps
	 * the search and the category, so reloading it shows the same page.
	 * @param {string} [id]
	 */
	function address(id) {
		const params = new URLSearchParams(page.url.searchParams);
		if (id) params.set('view', id);
		else params.delete('view');
		const search = params.toString();
		return search ? `/?${search}` : '/';
	}

	/**
	 * Shallow routing: the quick view gets its own history entry without leaving
	 * the page, so Back closes it. The link's address is the fallback, which the
	 * server renders with the dialog open.
	 * @param {MouseEvent & { currentTarget: HTMLAnchorElement }} event
	 */
	async function openQuickView(event) {
		if (event.shiftKey || event.metaKey || event.ctrlKey) return; // a new tab or window
		event.preventDefault();
		const { href } = event.currentTarget;
		// data-sveltekit-preload-data started this load when the link was hovered or tapped.
		const result = await preloadData(href);
		if (result.type === 'loaded' && result.status === 200) {
			pushState(href, { quickView: result.data.quickView });
		} else {
			goto(href);
		}
	}

	/**
	 * Back to the history entry without the quick view or, on a page loaded as
	 * /?view=<id>, on to the same address without it.
	 */
	function closeQuickView() {
		if (page.state.quickView) history.back();
		else goto(address(), { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<svelte:head>
	<title>Wirestore</title>
</svelte:head>

<header class="top">
	<a class="brand" href="/">Wirestore</a>
	<p class="cart">Cart <span id="cart-count">{data.cart.count}</span> · <span id="cart-total">{formatPrice(data.cart.total)}</span></p>
</header>
<main>
	<section class="intro">
		<h1>Everyday objects, made well</h1>
		<p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
	</section>
	<!-- A GET form, which the router handles like a link. Sent on every input, it
	     replaces the history entry and keeps the focus and the scroll position. -->
	<form
		class="search"
		role="search"
		action="/"
		method="get"
		data-sveltekit-keepfocus
		data-sveltekit-noscroll
		data-sveltekit-replacestate
		oninput={(event) => event.currentTarget.requestSubmit()}
	>
		<label for="q">Search products</label>
		<div class="search__row">
			<input id="q" name="q" type="search" value={q} autocomplete="off" />{#if category}<input type="hidden" name="category" value={category} />{/if}<button>Search</button>
		</div>
	</form>
	<nav class="categories" id="categories" aria-label="Categories">
		{#each [{ id: '', name: 'All' }, ...CATEGORIES] as link (link.id)}
			<a href={link.id ? `/?category=${link.id}` : '/'} aria-current={link.id === category ? 'page' : undefined}>{link.name}</a>
		{/each}
	</nav>
	<p class="count" id="result-count" role="status">{resultText(visible.length)}</p>
	<ul class="grid" id="products">
		{#each visible as product, index (product.id)}
			<ProductCard {product} eager={index < EAGER_IMAGES} href={address(product.id)} onquickview={openQuickView} />
		{/each}
	</ul>
	<section class="newsletter" aria-labelledby="newsletter-title">
		<h2 id="newsletter-title">Get the Wirestore letter</h2>
		<p>New arrivals and restocks, once a month.</p>
		<form id="newsletter" method="POST" action="?/subscribe" use:enhance>
			<label for="email">Email</label>
			<div class="newsletter__row">
				<input id="email" name="email" type="email" required autocomplete="email" value={form?.email ?? ''} /><button>Subscribe</button>
			</div>
		</form>
		<p id="newsletter-status" role="status">{form?.message ?? ''}</p>
	</section>
</main>
<QuickView product={quickView} modal={Boolean(page.state.quickView)} onclose={closeQuickView} />
<footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
