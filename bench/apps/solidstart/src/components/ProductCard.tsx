import { categoryName, formatPrice } from "#scenario/markup.js";
import AddToCart from "./AddToCart";

type Listing = { id: string; name: string; category: string; price: number };

/** One product in the grid, with the reference markup and image attributes. */
export default function ProductCard(props: {
  product: Listing;
  /** Whether the image loads eagerly: the first cards, which are on the first screen. */
  eager: boolean;
  /** This page's address with the quick view open on the product. */
  quickView: string;
}) {
  return (
    <li class="card" data-product={props.product.id} data-category={props.product.category}>
      <img src={`/images/${props.product.id}.webp`} alt="" width="480" height="360" loading={props.eager ? "eager" : "lazy"} decoding="async" />
      <h3>{props.product.name}</h3>
      <p class="meta"><span>{categoryName(props.product.category)}</span> <span class="price">{formatPrice(props.product.price)}</span></p>
      <div class="actions">
        {/* noScroll: the quick view opens over the page where it is. */}
        <AddToCart id={props.product.id} /><a class="quick" href={props.quickView} noScroll>Quick view</a>
      </div>
    </li>
  );
}
