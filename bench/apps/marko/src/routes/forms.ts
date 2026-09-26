/**
 * Whether a form's request asks for JSON. Without JavaScript the browser
 * posts the page's forms itself, accepts HTML and follows a redirect; once
 * the page runs, it sends the same forms with fetch and asks for JSON. The
 * router ignores this file: only `+` files are routes.
 */
export const wantsJson = (request: Request) => request.headers.get("accept")?.includes("application/json") ?? false;
