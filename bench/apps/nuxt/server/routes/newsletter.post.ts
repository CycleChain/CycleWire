import { INVALID_EMAIL, thanks, validEmail } from '#scenario/markup.js'

// POST /newsletter { email }: the sign-up. Without JavaScript the form posts
// here and the browser is redirected to the page, whose URL carries the result
// (?subscribed=<email> or ?newsletter=invalid); with it, the page sends the
// same request with $fetch and shows the message it gets back, which comes
// with a 422 for an address the server does not accept.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email ?? '').trim()
  const valid = validEmail(email)
  if (acceptsJson(event)) {
    if (!valid) setResponseStatus(event, 422)
    return { message: valid ? thanks(email) : INVALID_EMAIL }
  }
  return sendRedirect(event, valid ? `/?subscribed=${encodeURIComponent(email)}` : '/?newsletter=invalid', 303)
})
