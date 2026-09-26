/**
 * What the shared JSON API answers. The benchmark's proxy serves it at /api/
 * for every stack (bench/scenario/shared.js); on the server, ScenarioApi
 * answers the same requests in-process.
 */

/** A product as the listing shows it, without its description. */
export interface Listing {
  id: string;
  name: string;
  category: string;
  /** In cents. */
  price: number;
}

/** A product with its description, for the quick view. */
export interface Detail extends Listing {
  description: string;
}

/** GET /api/products */
export interface Products {
  count: number;
  items: Listing[];
}

/** GET and POST /api/cart */
export interface CartState {
  count: number;
  /** In cents. */
  total: number;
  /** Product id → quantity. */
  items: Record<string, number>;
}

/** POST /api/newsletter, and the body of its 422 */
export interface Message {
  message: string;
}
