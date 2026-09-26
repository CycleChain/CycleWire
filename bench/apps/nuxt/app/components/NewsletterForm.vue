<!--
  The newsletter sign-up. Without JavaScript the browser posts the form to
  server/routes/newsletter.post.ts, which redirects to /?subscribed=<email> or
  /?newsletter=invalid, and the page shows the message for it. With it, the
  same request goes out with $fetch and the message the server answers with
  is shown in place.
-->
<script setup lang="ts">
import { INVALID_EMAIL, thanks } from '#scenario/markup.js'

const route = useRoute()

const email = ref('')
const subscribed = route.query.subscribed
const status = ref(typeof subscribed === 'string' ? thanks(subscribed) : route.query.newsletter === 'invalid' ? INVALID_EMAIL : '')

async function subscribe() {
  try {
    const { message } = await $fetch('/newsletter', { method: 'POST', body: { email: email.value } })
    status.value = message
    email.value = ''
  }
  catch (error) {
    // An address the server does not accept: a 422, with its message.
    const message = (error as { data?: { message?: string } }).data?.message
    if (!message) throw error
    status.value = message
  }
}
</script>

<template>
  <section class="newsletter" aria-labelledby="newsletter-title">
    <h2 id="newsletter-title">Get the Wirestore letter</h2>
    <p>New arrivals and restocks, once a month.</p>
    <form id="newsletter" action="/newsletter" method="post" @submit.prevent="subscribe">
      <label for="email">Email</label>
      <div class="newsletter__row">
        <input id="email" v-model="email" name="email" type="email" required autocomplete="email"><button>Subscribe</button>
      </div>
    </form>
    <p id="newsletter-status" role="status">{{ status }}</p>
  </section>
</template>
