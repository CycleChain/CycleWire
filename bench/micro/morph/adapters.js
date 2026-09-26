/**
 * The three morph libraries, each called the way its documentation shows, to
 * make a container's children match target markup given as a string. Each
 * library parses the string itself, and that parsing is part of what is
 * timed.
 *
 * The metadata is read in Node (the results record it); load() runs in the
 * test page, which serves each package's own files under /lib/.
 */

/**
 * @typedef {object} MorphLibrary
 * @property {string} id
 * @property {string} name      as the tables show it
 * @property {string} package   whose installed version is recorded
 * @property {string} call      what the adapter calls
 * @property {Record<string, unknown>} options  the options passed
 * @property {string} defaults  the documented defaults this relies on
 * @property {() => Promise<(container: Element, markup: string) => void>} load
 */

/** @type {MorphLibrary[]} */
export const LIBRARIES = [
    {
        id: 'cyclewire',
        name: 'cyclewire/morph',
        package: 'cyclewire',
        call: 'morph(container, html.raw(markup))',
        options: {},
        defaults: "children: true (the container's children are morphed); elements pair by id anywhere, then by cw-key, then by tag at the same position; no transition, so the update is synchronous",
        async load() {
            const [{ morph }, { html }] = await Promise.all([import('/lib/cyclewire/morph.js'), import('/lib/cyclewire/dom.js')]);
            return (container, markup) => void morph(container, html.raw(markup));
        },
    },
    {
        id: 'morphdom',
        name: 'morphdom',
        package: 'morphdom',
        call: 'morphdom(container, `<${tag}>${markup}</${tag}>`, { childrenOnly: true })',
        options: { childrenOnly: true },
        defaults: "getNodeKey: the element's id (the default); a string target is parsed by morphdom and must be one element, so the markup is wrapped in the container's own tag, whose attributes childrenOnly leaves alone",
        async load() {
            const { default: morphdom } = await import('/lib/morphdom/morphdom-esm.js');
            return (container, markup) => {
                const tag = container.localName;
                morphdom(container, `<${tag}>${markup}</${tag}>`, { childrenOnly: true });
            };
        },
    },
    {
        id: 'idiomorph',
        name: 'idiomorph',
        package: 'idiomorph',
        call: "Idiomorph.morph(container, markup, { morphStyle: 'innerHTML' })",
        options: { morphStyle: 'innerHTML' },
        defaults: 'id-set matching; ignoreActive: false, ignoreActiveValue: false, restoreFocus: true (the defaults)',
        async load() {
            const { Idiomorph } = await import('/lib/idiomorph/idiomorph.esm.js');
            return (container, markup) => void Idiomorph.morph(container, markup, { morphStyle: 'innerHTML' });
        },
    },
];

/** @param {string} id */
export const morphLibrary = (id) => LIBRARIES.find((entry) => entry.id === id);
