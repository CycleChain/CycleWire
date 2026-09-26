import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // The benchmark's shared modules in bench/scenario/, two folders up: the
  // server routes read the catalog and the cart from them, and the page
  // formats prices and matches queries with the same functions. Nuxt passes
  // its aliases on to Nitro, so both builds resolve it.
  alias: {
    '#scenario': fileURLToPath(new URL('../../scenario', import.meta.url)),
  },

  app: {
    head: {
      title: 'Wirestore',
      htmlAttrs: { lang: 'en' },
      // The benchmark's shared stylesheet, the page's only one, served by its proxy.
      link: [{ rel: 'stylesheet', href: '/assets/app.css' }],
    },
  },
})
