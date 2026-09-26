// The shop's data and its two mutations: Solid Router queries and actions
// whose bodies run only on the server ("use server"). Everything comes from
// the benchmark's shared modules; the client build keeps only the references.
import { action, json, query, reload } from "@solidjs/router";
import { setCookie } from "@solidjs/start/http";
import { getRequestEvent } from "solid-js/web";
import { COOKIE, add, readCart } from "#scenario/cart.js";
import { detail, listing, product, products, summary } from "#scenario/catalog.js";
import { INVALID_EMAIL, thanks, validEmail } from "#scenario/markup.js";

// The cart is read from the request's Cookie header with the scenario's
// readCart. The header comes from getRequestEvent().request: after an action,
// the single-flight re-render that sends the new cart back in the same
// response runs with a request that carries the cookie the action has just
// set, while the @solidjs/start/http helpers still read the original request.

/** The visitor's cart as the header shows it (item count, total in cents), from the `cart` cookie. */
export const getCart = query(async () => {
  "use server";
  return summary(readCart(getRequestEvent()?.request.headers.get("cookie") ?? undefined));
}, "cart");

/** Every product without its description: what the cards, the search and the categories need. */
export const getProducts = query(async () => {
  "use server";
  return products.map(listing);
}, "products");

/** One product with its description, for the quick view, or null for an unknown id. */
export const getProduct = query(async (id: string) => {
  "use server";
  const found = product(id);
  return found ? detail(found) : null;
}, "product");

/**
 * Adds one of a product to the cart in the `cart` cookie (URL-encoded JSON,
 * Path=/, SameSite=Lax, HttpOnly, as the shared cartCookie() writes it). Only
 * the cart changed, so only the cart query is revalidated.
 */
export const addToCart = action(async (form: URLSearchParams) => {
  "use server";
  const items = add(readCart(getRequestEvent()?.request.headers.get("cookie") ?? undefined), form.get("id") ?? "");
  if (!items) throw new Error("No such product");
  setCookie(COOKIE, JSON.stringify(items), { path: "/", sameSite: "lax", httpOnly: true });
  return reload({ revalidate: getCart.key });
}, "addToCart");

/** The newsletter sign-up: the server's message for the address, and no data to revalidate. */
export const subscribe = action(async (form: URLSearchParams) => {
  "use server";
  const email = (form.get("email") ?? "").trim();
  return json({ message: validEmail(email) ? thanks(email) : INVALID_EMAIL }, { revalidate: [] });
}, "subscribe");
