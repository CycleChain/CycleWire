'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * The quick view as a modal over the page, for the intercepted route
 * app/@modal/(.)products/[id], as in the Next.js modal example (nextgram):
 * a native <dialog> opened with showModal(). However it closes (its Close
 * button, Escape), the router goes back to the page it was opened from, so
 * the URL and the history stay in step with what is on screen.
 */
export default function Modal({ children }) {
    const router = useRouter();
    const dialog = useRef(null);

    useEffect(() => {
        if (!dialog.current.open) dialog.current.showModal();
    }, []);

    return (
        <dialog id="quick-view" aria-labelledby="quick-view-title" ref={dialog} onClose={() => router.back()}>
            {children}
        </dialog>
    );
}
