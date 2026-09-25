'use client';

import { useActionState } from 'react';
import { subscribe } from '@/app/lib/actions';

const initialState = { message: '' };

/**
 * The newsletter form, with the server's message kept by useActionState.
 * Before hydration the browser posts the form, Next.js runs the action, and
 * the page it sends back already shows the message.
 */
export default function Newsletter() {
    const [state, formAction, pending] = useActionState(subscribe, initialState);
    return (
        <>
            <form id="newsletter" action={formAction}>
                <label htmlFor="email">Email</label>
                <div className="newsletter__row">
                    <input id="email" name="email" type="email" required autoComplete="email" />
                    <button disabled={pending}>Subscribe</button>
                </div>
            </form>
            <p id="newsletter-status" role="status">{state.message}</p>
        </>
    );
}
