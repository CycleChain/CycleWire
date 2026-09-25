import { component$ } from "@builder.io/qwik";
import { Form } from "@builder.io/qwik-city";
import type { useSubscribe } from "~/routes/index";

interface Props {
  subscribe: ReturnType<typeof useSubscribe>;
}

/**
 * A <Form> bound to the route action. Without JavaScript it posts and the page
 * comes back with the server's message; with it, Qwik City submits the form and
 * the action's value updates in place.
 */
export const Newsletter = component$<Props>(({ subscribe }) => (
  <section class="newsletter" aria-labelledby="newsletter-title">
    <h2 id="newsletter-title">Get the Wirestore letter</h2>
    <p>New arrivals and restocks, once a month.</p>
    <Form id="newsletter" action={subscribe}>
      <label for="email">Email</label>
      <div class="newsletter__row">
        <input id="email" name="email" type="email" required autocomplete="email" />
        <button>Subscribe</button>
      </div>
    </Form>
    <p id="newsletter-status" role="status">
      {subscribe.value?.message}
    </p>
  </section>
));
