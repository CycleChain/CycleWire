import type { H3Event } from 'h3'
import { COOKIE, readCart } from '#scenario/cart.js'
import { summary } from '#scenario/catalog.js'

type Items = Record<string, number>

/**
 * The cart in the request's `cart` cookie (product id → quantity), parsed
 * and checked by the scenario's readCart, which reads a Cookie header.
 */
export const getCart = (event: H3Event): Items => readCart(getRequestHeader(event, 'cookie'))

/**
 * Stores the cart in the `cart` cookie with h3's setCookie, which URL-encodes
 * the value: the cookie the scenario's cartCookie() describes (URL-encoded
 * JSON, Path=/, SameSite=Lax, HttpOnly).
 */
export function setCart(event: H3Event, items: Items) {
  setCookie(event, COOKIE, JSON.stringify(items), { path: '/', sameSite: 'lax', httpOnly: true })
}

/** A cart as the page shows it: the item count and the total, with the items. */
export const cartJson = (items: Items) => ({ ...summary(items), items })
