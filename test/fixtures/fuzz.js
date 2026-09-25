// Seeded generators for fuzzing `html`, shared by the Node property tests
// (test/unit/html.property.test.js) and the browser oracle
// (test/e2e/html-oracle.spec.js). A plain ES module with no dependencies, so
// the fixture server can hand it to the browser as it is.

/**
 * mulberry32: a small, fast, seedable pseudo-random generator.
 * @param {number} seed
 */
export function prng(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        /** @param {number} n */
        int: (n) => Math.floor(next() * n),
        /** @template T @param {readonly T[]} list @returns {T} */
        pick: (list) => list[Math.floor(next() * list.length)],
        /** @param {number} p */
        chance: (p) => next() < p,
    };
}

/** @typedef {ReturnType<typeof prng>} Random */

/** The seed for today's runs: stable within a day, different across days. Override with FUZZ_SEED. */
export const daySeed = () => Math.floor(Date.now() / 864e5);

/**
 * What an attacker would try: the characters HTML treats specially, character
 * references, comment and raw-text breakers, and URL schemes in disguise.
 */
export const PIECES = [
    '&', '<', '>', '"', "'", '`', '=', '/', '\\', ' ', '\t', '\n', '\r', '\f', '\0', '\x01', '\x7f',
    '&#x6A;', '&#106;', '&lt;', '&amp;', '&quot;', '&colon;', '&Tab;',
    '-->', '<!--', '</script', '</style', '<script>', '<img src=x onerror=alert(1)>', ']]>',
    'javascript:', 'JaVaScRiPt:', 'java\tscript:', 'vbscript:', 'data:text/html,', 'https://example.com/', ':', 'alert(1)',
    'a', 'b', '1', 'é', '😀', '\ud800', ' onerror=', '" onmouseover="', "' onfocus='",
];

/**
 * A random string built from PIECES.
 * @param {Random} random @param {number} [max] pieces at most
 */
export function adversarial(random, max = 6) {
    let text = '';
    for (let i = random.int(max + 1); i > 0; i--) text += random.pick(PIECES);
    return text;
}

// Markup for the browser oracle. `§` marks where an interpolation goes. The
// ones in SAFE put it where escaping protects it; the ones in UNSAFE must make
// `html` throw; NOISE has no interpolation and exercises the analyzer's states.
export const SAFE = [
    'text § ', '<p>§</p>', '<p title="§">x</p>', "<p title='§'>x</p>", '<a href="/p?q=§">x</a>', '<a href="§">x</a>',
    '<img alt="§">', '<textarea>§</textarea>', '<title>§</title>', '<table><tr><td>§</td></tr></table>', '<table>§</table>',
    '<svg><text>§</text></svg>', '<svg><a href="§">x</a></svg>', '<math><mi>§</mi></math>', '<select><option>§</option></select>',
    '<ul><li>§</ul>', '<p data-x="§" class="§">§</p>', '<input value="§">', '<button formaction="/go/§">x</button>',
];
export const UNSAFE = [
    '<p §>', '<§>', '</§>', '<p title=§>', '<p onclick="§">', '<p ONMOUSEOVER="§">', '<iframe srcdoc="§">',
    '<script>§</script>', '<style>§</style>', '<!-- § -->', '<noscript>§</noscript>', '<xmp>§</xmp>', '<?§>',
];
export const NOISE = [
    'plain ', '<br>', '<hr/>', '<div>', '</div>', '<b>', '</b>', '</p>', '<!-- x -->', '<!---->', '<script>1 < 2</script>',
    '<style>b > i {}</style>', '<textarea>t</textarea>', '<svg><style>x</style></svg>', '<noscript>n</noscript>',
    '<xmp><b></xmp>', '<?php x ?>', '<!DOCTYPE html>', '<svg><![CDATA[ a > b ]]></svg>', '<p class=x>', '<a href="/x" title=\'y\'>',
];

/**
 * A random template: 1–5 pieces joined, split at the `§` marks.
 * @param {Random} random
 * @returns {{ strings: string[], unsafe: boolean }}
 */
export function template(random) {
    let markup = '';
    let unsafe = false;
    for (let i = random.int(5) + 1; i > 0; i--) {
        const roll = random.next();
        if (roll < 0.15) {
            markup += random.pick(UNSAFE);
            unsafe = true;
        } else markup += random.pick(roll < 0.6 ? SAFE : NOISE);
    }
    return { strings: markup.split('§'), unsafe };
}

/** Elements whose content the parser reads as raw text: nothing in them is markup. */
export const RAW_TEXT = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
