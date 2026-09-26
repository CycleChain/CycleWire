import type { H3Event } from 'h3'

/**
 * Whether a form's request asks for JSON. The page's forms post natively
 * without JavaScript (the browser accepts HTML and follows a redirect); with
 * it, the page sends them with $fetch, which asks for JSON.
 */
export const acceptsJson = (event: H3Event) => getRequestHeader(event, 'accept')?.includes('application/json') ?? false

/** The path and query of a same-origin Referer: the page a form was posted from. */
export function refererPath(event: H3Event) {
  try {
    const referer = new URL(getRequestHeader(event, 'referer') ?? '')
    if (referer.host === getRequestHost(event)) return referer.pathname + referer.search
  }
  catch {
    // No Referer, or not a URL.
  }
  return '/'
}
