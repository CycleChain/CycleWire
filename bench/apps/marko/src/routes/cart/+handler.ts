// POST /cart: adds one of a product to the cart in the `cart` cookie. The
// add-to-cart forms post here. Without JavaScript the browser is sent back to
// the page it came from (Post/Redirect/Get), which renders the new cart; the
// page itself sends the same form with fetch and gets the new cart as JSON.
import { add, cartCookie, readCart } from "../../../../../scenario/cart.js";
import { summary } from "../../../../../scenario/catalog.js";
import { wantsJson } from "../forms.js";

export const POST = Run.POST(
  // The product's id, from the form's `id` field.
  { form: (form) => String(form.id ?? "") },
  async (ctx) => {
    const items = add(readCart(ctx.request.headers.get("cookie") ?? undefined), await ctx.body);
    if (!items) return new Response("No such product", { status: 404 });
    const response = wantsJson(ctx.request) ? Response.json(summary(items)) : ctx.back("/", 303);
    response.headers.append("set-cookie", cartCookie(items));
    return response;
  },
);
