// POST /newsletter: the sign-up. Without JavaScript the form posts here and
// the browser is redirected to the page, whose URL carries the result
// (?subscribed=<email> or ?newsletter=invalid); the page itself sends the
// same form with fetch and shows the message it gets back, which comes with a
// 422 for an address the server does not accept.
import { INVALID_EMAIL, thanks, validEmail } from "../../../../../scenario/markup.js";
import { wantsJson } from "../forms.js";

export const POST = Run.POST(
  // The address, from the form's `email` field.
  { form: (form) => String(form.email ?? "").trim() },
  async (ctx) => {
    const email = await ctx.body;
    const valid = validEmail(email);
    if (wantsJson(ctx.request)) {
      return Response.json({ message: valid ? thanks(email) : INVALID_EMAIL }, { status: valid ? 200 : 422 });
    }
    return ctx.redirect(valid ? `/?subscribed=${encodeURIComponent(email)}` : "/?newsletter=invalid", 303);
  },
);
