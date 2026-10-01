/**
 * Where the site lives: the landing page's URL, ending in a slash. The
 * documentation, the landing page's share tags and the benchmark's links are
 * built for it, and the dev server answers under its path too.
 *
 * GitHub Pages by default. CYCLEWIRE_SITE moves it: the Pages workflow sets it
 * to https://cyclechain.io/labs/cyclewire/ once the repository variable
 * SITE_DEPLOY is "server" (docs/releasing.md).
 */
export const PAGES = 'https://cyclechain.github.io/CycleWire/';
export const SITE = new URL(process.env.CYCLEWIRE_SITE || PAGES).href;

/**
 * Text with links to the site as the sources write them (the Pages address),
 * pointing at SITE instead.
 * @param {string} text
 */
export const relocate = (text) => (SITE === PAGES ? text : text.replaceAll(PAGES, SITE));
