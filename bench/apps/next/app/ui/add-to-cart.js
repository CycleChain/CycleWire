import { addToCart } from '@/app/lib/actions';

/**
 * A form that calls the addToCart Server Action. Rendered by a Server
 * Component, so it works before hydration and without JavaScript: the
 * browser posts it, and Next.js runs the action and answers with the page.
 */
export default function AddToCart({ id }) {
    return (
        <form action={addToCart}>
            <input type="hidden" name="id" value={id} />
            <button>Add to cart</button>
        </form>
    );
}
