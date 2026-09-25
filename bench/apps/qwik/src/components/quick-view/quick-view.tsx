import { component$, useSignal, useVisibleTask$, type Signal } from "@builder.io/qwik";
import { Form } from "@builder.io/qwik-city";
import { categoryName, formatPrice } from "../../../../../scenario/markup.js";
import type { Detail, useAddToCart } from "~/routes/index";

type AddToCart = ReturnType<typeof useAddToCart>;

interface Props {
  product: Signal<Detail | null>;
  /** Rendered open by the server, for ?view= without JavaScript. It never changes. */
  open: boolean;
  addToCart: AddToCart;
}

/**
 * The quick view is a native <dialog>. A card sets `product`; the content
 * renders, and then it opens the dialog as a modal. The dialog's `open`
 * attribute is left to the browser after the server rendered it.
 */
export const QuickView = component$<Props>((props) => {
  const dialog = useSignal<HTMLDialogElement>();
  return (
    <dialog id="quick-view" aria-labelledby="quick-view-title" open={props.open} ref={dialog}>
      {props.product.value && (
        <QuickViewContent product={props.product} dialog={dialog} addToCart={props.addToCart} />
      )}
    </dialog>
  );
});

interface ContentProps {
  product: Signal<Detail | null>;
  dialog: Signal<HTMLDialogElement | undefined>;
  addToCart: AddToCart;
}

const QuickViewContent = component$<ContentProps>(({ product, dialog, addToCart }) => {
  // showModal() has to wait until the product is in the DOM, and useVisibleTask$
  // is the task that runs after rendering. This component only exists once a
  // product has been chosen, so on the page as first served nothing runs early.
  useVisibleTask$(({ track }) => {
    track(product);
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
  });
  const item = product.value;
  if (!item) return null;
  return (
    <div class="quick-view">
      <img src={`/images/${item.id}.webp`} alt="" width={480} height={360} />
      <div class="quick-view__body">
        <h2 id="quick-view-title">{item.name}</h2>
        <p class="meta">
          <span>{categoryName(item.category)}</span> <span class="price">{formatPrice(item.price)}</span>
        </p>
        <p>{item.description}</p>
        <div class="actions">
          <Form action={addToCart}>
            <input type="hidden" name="id" value={item.id} />
            <button>Add to cart</button>
          </Form>
          <form method="dialog">
            <button>Close</button>
          </form>
        </div>
      </div>
    </div>
  );
});
