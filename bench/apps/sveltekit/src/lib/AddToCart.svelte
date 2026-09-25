<!--
	Posts to the page's `add` action. Without JavaScript the browser sends the form
	and the server renders the page with the new cart; with it, use:enhance sends
	it with fetch and then re-runs the page's load, which reads the cart cookie.
-->
<script>
	import { enhance } from '$app/forms';

	/** @type {{ id: string, submit?: import('@sveltejs/kit').SubmitFunction }} */
	let { id, submit } = $props();
</script>

<form method="POST" action="?/add" use:enhance={submit}>
	<input type="hidden" name="id" value={id} /><button>Add to cart</button>
</form>
