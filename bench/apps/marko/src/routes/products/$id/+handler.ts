// GET /products/<id>: one product with its description, which the page's
// listing leaves out. The quick view asks for it when it opens in the page.
import { detail, product } from "../../../../../../scenario/catalog.js";

export const GET = Run.GET((ctx) => {
  const found = product(ctx.params.id);
  if (!found) return new Response("No such product", { status: 404 });
  return Response.json(detail(found));
});
