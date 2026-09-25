// The newsletter component: `x-data="newsletter(status)"` on its section. The
// form posts the address to the shared API and the status line shows the
// server's answer, a thank-you or the reason the address was refused.

/** @param {string} status what the status line shows when the page loads */
export default (status = '') => ({
    status,

    /** `@submit.prevent="subscribe"` on the form. */
    async subscribe() {
        const response = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: this.$refs.email.value }),
        });
        const { message } = await response.json();
        this.status = message;
    },
});
