/**
 * Resolves once `element` has left the document, so an island can unmount
 * when a swap, a morph or your own code removes it. One observer serves every
 * island on the page, and it disconnects when none is left to watch.
 *
 * Islands inside a shadow root need an observer on that root instead.
 */

/** @type {Map<Element, () => void>} */
const watched = new Map();
/** @type {MutationObserver | undefined} */
let observer;

/**
 * @param {Element} element
 * @returns {Promise<void>}
 */
export function removed(element) {
    return new Promise((resolve) => {
        watched.set(element, resolve);
        if (observer) return;
        observer = new MutationObserver(() => {
            for (const [el, resolve] of watched) {
                if (el.isConnected) continue;
                watched.delete(el);
                resolve();
            }
            if (!watched.size) {
                observer?.disconnect();
                observer = undefined;
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    });
}
