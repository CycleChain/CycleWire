import { Show, createEffect, on } from "solid-js";
import { categoryName, formatPrice } from "#scenario/markup.js";
import AddToCart from "./AddToCart";

type Product = { id: string; name: string; category: string; price: number; description: string };

/**
 * The quick view: a native <dialog id="quick-view">, open on a product and
 * empty otherwise. On a page loaded with ?view=<id>, the server renders it
 * open, which is how it shows without JavaScript, and it stays that way (not
 * modal) until it closes. Opened in the page, it is a modal: showModal()
 * makes the page behind it inert, moves the focus into it and lets Escape
 * close it. Its Close button is a <form method="dialog">, which closes it with
 * or without JavaScript.
 */
export default function QuickView(props: {
  product: Product | null | undefined;
  /** Called once the dialog has closed; `modal` says whether the page had opened it. */
  onClose: (modal: boolean) => void;
}) {
  let dialog!: HTMLDialogElement;
  const renderedOpen = Boolean(props.product);
  let modal = false;

  // Once the product's details are on the page, show them in a modal; when the
  // product goes away (Back), close it.
  createEffect(
    on(
      () => props.product,
      product => {
        if (product && !dialog.open) {
          dialog.showModal();
          modal = true;
        } else if (!product && dialog.open) dialog.close();
      },
      { defer: true },
    ),
  );

  function closed() {
    const wasModal = modal;
    modal = false;
    props.onClose(wasModal);
  }

  return (
    <dialog id="quick-view" aria-labelledby="quick-view-title" ref={dialog} open={renderedOpen} onClose={closed}>
      <Show when={props.product}>
        {product => (
          <div class="quick-view">
            <img src={`/images/${product().id}.webp`} alt="" width="480" height="360" />
            <div class="quick-view__body">
              <h2 id="quick-view-title">{product().name}</h2>
              <p class="meta"><span>{categoryName(product().category)}</span> <span class="price">{formatPrice(product().price)}</span></p>
              <p>{product().description}</p>
              <div class="actions">
                <AddToCart id={product().id} /><form method="dialog"><button>Close</button></form>
              </div>
            </div>
          </div>
        )}
      </Show>
    </dialog>
  );
}
