import { addToCart } from "~/lib/api";

/**
 * Adds one of a product to the cart. The form's action is the server
 * function's address, so without JavaScript the browser posts it there and is
 * sent back to the page; with it, the router sends it with fetch.
 */
export default function AddToCart(props: { id: string }) {
  return (
    <form action={addToCart} method="post">
      <input type="hidden" name="id" value={props.id} /><button>Add to cart</button>
    </form>
  );
}
