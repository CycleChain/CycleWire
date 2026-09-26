<!--
  The shop's frame, shared by every page: the header with the cart, and the
  footer. The server reads the cart from the `cart` cookie (server/routes/
  cart.get.ts), so the header is rendered with it; adding to the cart replaces
  it with the cart the server answers with (see AddToCart.vue).
-->
<script setup lang="ts">
import { formatPrice } from '#scenario/markup.js'

const { data: cart } = await useFetch('/cart', { key: 'cart', default: () => ({ count: 0, total: 0 }) })
</script>

<template>
  <NuxtRouteAnnouncer />
  <header class="top">
    <NuxtLink class="brand" to="/">Wirestore</NuxtLink>
    <p class="cart">Cart <span id="cart-count">{{ cart.count }}</span> · <span id="cart-total">{{ formatPrice(cart.total) }}</span></p>
  </header>
  <NuxtPage />
  <footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
</template>
