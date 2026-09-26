import { add } from '#scenario/cart.js'

// POST /cart { id }: adds one of a product to the cart in the `cart` cookie.
// The add-to-cart forms post here. Without JavaScript the browser sends the
// form and is redirected back to the page it came from, which renders the new
// cart; with it, the page sends the same request with $fetch and gets the new
// cart back as JSON.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const items = add(getCart(event), String(body?.id ?? ''))
  if (!items) throw createError({ status: 404, statusText: 'No such product' })
  setCart(event, items)
  if (acceptsJson(event)) return cartJson(items)
  return sendRedirect(event, refererPath(event), 303)
})
