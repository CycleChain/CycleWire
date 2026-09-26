import { detail, product } from '#scenario/catalog.js'

// GET /products/<id>: one product with its description, for the quick view.
export default defineEventHandler((event) => {
  const found = product(getRouterParam(event, 'id') ?? '')
  if (!found) throw createError({ status: 404, statusText: 'No such product' })
  return detail(found)
})
