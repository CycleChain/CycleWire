<!--
  The quick view: a native <dialog id="quick-view">, open on a product and
  empty otherwise. On a page loaded with ?view=<id>, the server renders it open,
  which is how it shows without JavaScript, and it stays that way (not modal)
  until it closes. Opened in the page, it is a modal: showModal() makes the page
  behind it inert, moves the focus into it and lets Escape close it. Its Close
  button is a <form method="dialog">, which closes it with or without JavaScript.
-->
<script setup lang="ts">
import { categoryName, formatPrice } from '#scenario/markup.js'

const props = defineProps<{
  /** The product to show, or '' for none. */
  id: string
}>()
const emit = defineEmits<{ close: [] }>()

// The product with its description, which the listing leaves out: fetched when
// a product is chosen, or with the page when it is loaded with ?view=<id>.
const { data: product } = await useAsyncData(
  () => `quick-view:${props.id}`,
  (_nuxtApp, { signal }) => (props.id ? $fetch(`/products/${props.id}`, { signal }) : Promise.resolve(null)),
)

const dialog = useTemplateRef<HTMLDialogElement>('dialog-element')
const openAsRendered = ref(Boolean(product.value))

// Once the product's details are on the page, show them in a modal; when the
// product goes away (Back), close it.
watch(product, (shown) => {
  const element = dialog.value
  if (!element) return
  if (shown && !element.open) element.showModal()
  else if (!shown && element.open) element.close()
}, { flush: 'post' })

function closed() {
  openAsRendered.value = false
  emit('close')
}
</script>

<template>
  <dialog id="quick-view" ref="dialog-element" aria-labelledby="quick-view-title" :open="openAsRendered" @close="closed">
    <div v-if="product" class="quick-view">
      <img :src="`/images/${product.id}.webp`" alt="" width="480" height="360">
      <div class="quick-view__body">
        <h2 id="quick-view-title">{{ product.name }}</h2>
        <p class="meta"><span>{{ categoryName(product.category) }}</span> <span class="price">{{ formatPrice(product.price) }}</span></p>
        <p>{{ product.description }}</p>
        <div class="actions">
          <AddToCart :id="product.id" /><form method="dialog"><button>Close</button></form>
        </div>
      </div>
    </div>
  </dialog>
</template>
