<!--
  Adds one of a product to the cart. Without JavaScript the browser posts the
  form to server/routes/cart.post.ts, which sets the cookie and redirects back
  to the page. With it, the same request goes out with $fetch, and the cart the
  server answers with replaces the header's (the `cart` data of app.vue).
-->
<script setup lang="ts">
const props = defineProps<{ id: string }>()

const { data: cart } = useNuxtData('cart')

async function add() {
  cart.value = await $fetch('/cart', { method: 'POST', body: { id: props.id } })
}
</script>

<template>
  <form method="post" action="/cart" @submit.prevent="add">
    <input type="hidden" name="id" :value="id"><button>Add to cart</button>
  </form>
</template>
