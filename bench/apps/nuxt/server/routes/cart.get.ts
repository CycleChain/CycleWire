// GET /cart: the visitor's cart, from the `cart` cookie. The header loads it
// with useFetch, which forwards the page request's cookies during server rendering.
export default defineEventHandler(event => cartJson(getCart(event)))
