import { useSubmission } from "@solidjs/router";
import { subscribe } from "~/lib/api";

/**
 * The newsletter sign-up. With JavaScript the router sends the form to the
 * action and the page shows the message it returns. Without it, the browser
 * posts the form, SolidStart sends it back to the page with the result in a
 * short-lived cookie, and the server renders the same message.
 */
export default function NewsletterForm() {
  const submission = useSubmission(subscribe);
  return (
    <section class="newsletter" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title">Get the Wirestore letter</h2>
      <p>New arrivals and restocks, once a month.</p>
      <form id="newsletter" action={subscribe} method="post">
        <label for="email">Email</label>
        <div class="newsletter__row">
          <input id="email" name="email" type="email" required autocomplete="email" /><button>Subscribe</button>
        </div>
      </form>
      <p id="newsletter-status" role="status">{submission.result?.message}</p>
    </section>
  );
}
