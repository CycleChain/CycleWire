import { listing, products } from '#scenario/catalog.js'

// GET /products: every product without its description, which is what the
// cards, the search and the category filters need.
export default defineEventHandler(() => products.map(listing))
