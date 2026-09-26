<!--
  The shop: the search, the categories, the product grid, the newsletter and
  the quick view. The URL holds the state (?q=, ?category=, ?view=): the server
  renders it, and without JavaScript the links and the search form load it.
  In the browser the router changes it, and the page filters the products it
  already has.
-->
<script setup lang="ts">
import { CATEGORIES, EAGER_IMAGES, matches, resultText } from '#scenario/markup.js'

const route = useRoute()
const router = useRouter()

/** A query parameter's value: the first one when it is repeated, '' when it is missing. */
function param(name: string): string {
  const value = route.query[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** An address on this page with these query parameters, leaving out the empty ones. */
function address(params: Record<string, string>) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return search ? `/?${search}` : '/'
}

// Every product without its description, loaded with the page. The search and
// the categories filter it in the browser, without asking the server again.
const { data: products } = await useFetch('/products', { default: () => [] })

const isProduct = (id: string) => products.value.some(product => product.id === id)
const isCategory = (id: string) => CATEGORIES.some(candidate => candidate.id === id)

const q = computed(() => param('q'))
const category = computed(() => (isCategory(param('category')) ? param('category') : ''))
const view = computed(() => (isProduct(param('view')) ? param('view') : ''))
const visible = computed(() => products.value.filter(product => matches(product, { q: q.value, category: category.value })))

const categoryLinks = [{ id: '', name: 'All' }, ...CATEGORIES]

/**
 * Typing searches: ?q= is replaced in the URL on every input, without a
 * history entry per key, and the category stays. A category link leaves ?q=
 * out, which clears the box.
 */
async function search(event: Event) {
  const { value } = event.target as HTMLInputElement
  await navigateTo(address({ q: value, category: category.value }), { replace: true })
}

/**
 * The quick view closed (its Close button, or Escape): back to the address
 * without ?view=. If the page opened it, that is the previous history entry,
 * so Back and Forward stay in step with the screen; on a page loaded with
 * ?view=, the address is replaced.
 */
async function closeQuickView() {
  if (!view.value) return // a navigation (Back) closed it
  if (router.options.history.state.back) router.back()
  else await navigateTo(address({ q: q.value, category: category.value }), { replace: true })
}
</script>

<template>
  <main>
    <section class="intro">
      <h1>Everyday objects, made well</h1>
      <p>Lamps, chairs, pans and pens from small workshops. Free returns for 60 days.</p>
    </section>
    <!-- Without JavaScript, a GET form that loads the page with the results. -->
    <form class="search" role="search" action="/" method="get" @submit.prevent>
      <label for="q">Search products</label>
      <div class="search__row">
        <input id="q" name="q" type="search" :value="q" autocomplete="off" @input="search"><input v-if="category" type="hidden" name="category" :value="category"><button>Search</button>
      </div>
    </form>
    <nav id="categories" class="categories" aria-label="Categories">
      <!-- Vue Router leaves the query out when it marks the current link, so aria-current is set here. -->
      <NuxtLink
        v-for="link in categoryLinks"
        :key="link.id"
        :to="address({ category: link.id })"
        :aria-current="link.id === category ? 'page' : undefined"
      >{{ link.name }}</NuxtLink>
    </nav>
    <p id="result-count" class="count" role="status">{{ resultText(visible.length) }}</p>
    <ul id="products" class="grid">
      <ProductCard
        v-for="(product, index) in visible"
        :key="product.id"
        :product="product"
        :eager="index < EAGER_IMAGES"
        :quick-view="address({ q, category, view: product.id })"
      />
    </ul>
    <NewsletterForm />
    <QuickView :id="view" @close="closeQuickView" />
  </main>
</template>
