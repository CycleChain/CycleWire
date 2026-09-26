# The documentation site

`docs/*.md` in the repository root, built with [Starlight](https://starlight.astro.build/)
into `/CycleWire/docs/` on GitHub Pages. The Markdown files stay the only source and read
the same on GitHub; `sync-docs.js` copies them into `src/content/docs/` at build time,
takes each page's title from its first heading, rewrites its links for the site, and
builds the sidebar from `docs/README.md`.

```sh
npm ci
npm run dev      # http://localhost:4321/CycleWire/docs/, following edits to docs/
npm run build    # into dist/, then checks the JavaScript every page loads
```

The build stops when a page links to a page or anchor that does not exist, when
`docs/README.md` does not list a page, or when a page loads more JavaScript up front than
`scripts/check-js.js` allows. The repository's `node scripts/site.js` puts `dist/` under
`/docs/`, and `node scripts/serve.js` serves it there.
