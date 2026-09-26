<!-- One product in the grid, with the reference's markup and image attributes. -->
<script setup lang="ts">
import { categoryName, formatPrice } from '#scenario/markup.js'

defineProps<{
  product: { id: string, name: string, category: string, price: number }
  /** Whether the image loads eagerly: the first cards, which are on the first screen. */
  eager: boolean
  /** This page's address with the quick view open on the product. */
  quickView: string
}>()
</script>

<template>
  <li class="card" :data-product="product.id" :data-category="product.category">
    <img :src="`/images/${product.id}.webp`" alt="" width="480" height="360" :loading="eager ? 'eager' : 'lazy'" decoding="async">
    <h3>{{ product.name }}</h3>
    <p class="meta"><span>{{ categoryName(product.category) }}</span> <span class="price">{{ formatPrice(product.price) }}</span></p>
    <div class="actions">
      <!-- Vue Router leaves the query out when it marks the link to the current page, so without
           aria-current here every Quick view link would say it is the current page. -->
      <AddToCart :id="product.id" /><NuxtLink class="quick" :to="quickView" :aria-current="undefined">Quick view</NuxtLink>
    </div>
  </li>
</template>
