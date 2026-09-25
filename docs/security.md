# Security

## Markup can only reach code you registered

Attributes name actions, never files. The registry is the only way from a name to a
module, and CycleWire:
- never imports a URL taken from markup,
- never uses `eval` or `new Function`,
- only accepts names made of letters, digits, `_`, `-` and `.`.

```html
<!-- Does nothing: neither is a registered name. -->
<button data-cw-action="../../evil.js">x</button>
<button data-cw-action="https://attacker.example/x.js">x</button>
```

### Script gadgets: injected markup can still call registered actions

If an attacker can inject HTML into your page, for example through a comment field
rendered without sanitization, they can add `data-cw-*` attributes that call actions you
registered. `load` and `visible` triggers even run without a click. Treat every export of
an action module as reachable from markup (`module#export`) and defend in depth:

1. **Wrap user-generated content in `data-cw-ignore`.** The search for a binding stops at
   that element, so nothing inside it can bind:

   ```html
   <article class="comment" data-cw-ignore>{{ comment.html }}</article>
   ```

2. **Strip CycleWire attributes when you sanitize.** With DOMPurify:

   ```js
   DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
       if (data.attrName.startsWith('data-cw-') || data.attrName === 'data-cyclewire') data.keepAttr = false;
   });
   ```

3. **Keep exports intentional.** Do not put destructive helpers in modules you register.
   An action that changes data should verify on the server, like any request.

## `html` escapes by context

`html` from [`cyclewire/dom`](dom.md):
- escapes text and quoted attribute values,
- **throws** for interpolations in tag or attribute names, unquoted values, `on*` and
  `srcdoc` attributes, comments, and raw-text elements such as `<script>` and `<style>`,
- refuses `javascript:` and `vbscript:` URLs in URL attributes, even disguised with case,
  whitespace or control characters,
- recognises `SafeHTML` by a symbol brand, so a plain object from JSON can never pass as
  markup.

`html.raw()` is the one door for trusted markup, such as HTML your own server rendered.
Never pass user input to it.

## Parsing is inert

`fragment()`, `swap()` and `morph()` parse through a `<template>`. Until insertion,
nothing in the parsed markup runs: no `onerror`, no image loads. The classic XSS path of
assigning to a detached `div.innerHTML`, where `<img onerror>` fires immediately, is
closed. `<script>` elements in parsed markup never run, even after insertion.

## Content Security Policy

CycleWire needs no `unsafe-eval` and no inline script. The optional
`<script type="application/json" data-cyclewire>` block is data, which CSP does not
block.

- **Same-origin action modules:** `script-src 'self'` covers them.
- **Nonce-based policies:** with `'strict-dynamic'`, modules that trusted scripts import
  are trusted too.

  ```http
  Content-Security-Policy: script-src 'nonce-{random}' 'strict-dynamic'; object-src 'none'; base-uri 'none'
  ```

- **CDN:** allow the host (`https://cdn.jsdelivr.net`), pin an exact version and add the
  SRI hash from the release notes.
- **Action stylesheets** (`cyclewire/css`) are ordinary `<link rel="stylesheet">`
  elements, so `style-src` must allow their URLs.

## Stylesheet URLs come from the registry too

CSS can leak data (attribute selectors that request a background image per character)
and can restyle a page to mislead. That is why stylesheet URLs follow the same rule as
modules: `cyclewire/css` takes them from `{ module, css }` entries or from `css()` calls in
your code, and never from markup.

## Trusted Types

When the page enforces `require-trusted-types-for 'script'`, `cyclewire/dom` and
`cyclewire/morph` parse markup through a Trusted Types policy named `cyclewire`. Allow it:

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types cyclewire
```

The core never touches an HTML sink.

## Preventing defaults safely

CycleWire only calls `preventDefault()` once it knows the action is registered. If an
action is missing or failed to load, links and forms keep their native behaviour instead
of silently doing nothing.

## Reporting

See [SECURITY.md](../SECURITY.md).
