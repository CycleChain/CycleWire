export async function run({ element, signal }) {
    const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: element.elements.namedItem('email').value }),
        signal,
    });
    const { message } = await response.json();
    document.getElementById('newsletter-status').textContent = message;
}
