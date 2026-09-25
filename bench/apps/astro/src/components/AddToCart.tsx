// The add-to-cart form, in each card and in the quick view. Without
// JavaScript it posts to the page through the addToCart action; once its
// island has hydrated it calls the action from the browser instead.
import { actions } from 'astro:actions';
import type { TargetedSubmitEvent } from 'preact';
import { useState } from 'preact/hooks';
import { addToCart } from '../stores/cart';

export default function AddToCart({ id }: { id: string }) {
    const [busy, setBusy] = useState(false);

    async function submit(event: TargetedSubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        try {
            await addToCart(event.currentTarget);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form method="post" action={actions.addToCart.queryString} onSubmit={submit} aria-busy={busy || undefined}>
            <input type="hidden" name="id" value={id} />
            <button>Add to cart</button>
        </form>
    );
}
