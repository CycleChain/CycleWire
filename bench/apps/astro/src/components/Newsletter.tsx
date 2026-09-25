// The newsletter sign-up. Without JavaScript the form posts to the page
// through the newsletter action, and the page renders the result; once
// hydrated, the island calls the action and shows the server's message.
import { actions, isInputError } from 'astro:actions';
import type { TargetedSubmitEvent } from 'preact';
import { useState } from 'preact/hooks';

/** The message to show for a failed sign-up: the email field's validation message. */
export const failure = (error: Error) => (isInputError(error) ? error.fields.email?.join(' ') : undefined) ?? error.message;

export default function Newsletter({ status: rendered }: { status: string }) {
    const [status, setStatus] = useState(rendered);
    const [busy, setBusy] = useState(false);

    async function subscribe(event: TargetedSubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        try {
            const { data, error } = await actions.newsletter(new FormData(event.currentTarget));
            setStatus(error ? failure(error) : data.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section class="newsletter" aria-labelledby="newsletter-title">
            <h2 id="newsletter-title">Get the Wirestore letter</h2>
            <p>New arrivals and restocks, once a month.</p>
            <form id="newsletter" method="post" action={actions.newsletter.queryString} onSubmit={subscribe} aria-busy={busy || undefined}>
                <label for="email">Email</label>
                <div class="newsletter__row">
                    <input id="email" name="email" type="email" required autocomplete="email" />
                    <button>Subscribe</button>
                </div>
            </form>
            <p id="newsletter-status" role="status">{status}</p>
        </section>
    );
}
