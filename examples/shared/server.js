/**
 * Stands in for your server, so the examples also run on a static host: the
 * live demos are on GitHub Pages, which cannot answer a POST. It answers
 * after a short delay, and honours the action's AbortSignal like a real
 * request would. A real app sends the request instead:
 *
 *   const response = await fetch(url, { method: 'POST', body, signal });
 *   if (!response.ok) throw new Error(`${url} answered ${response.status}`);
 *
 * @param {string} url
 * @param {FormData | URLSearchParams} body
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export function post(url, body, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 250);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
        }, { once: true });
    });
}
