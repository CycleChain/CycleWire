// A quick handler, and one that holds the main thread for 30 ms.
export function quick() {
    window.__log.push('quick');
}

export function heavy() {
    const end = performance.now() + 30;
    while (performance.now() < end) {
        // Busy on purpose.
    }
    window.__log.push('heavy');
}

// Reads the element's prefetched data through ctx.fetch.
export async function item({ element, fetch, signal }) {
    const response = await fetch(element.getAttribute('cw-prefetch'), { signal });
    window.__log.push(['item', (await response.json()).name]);
}
