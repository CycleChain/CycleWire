// Property tests for `html`: thousands of generated inputs per run, seeded so a
// failure can be replayed. FUZZ_SEED picks the seed (default: one per day) and
// FUZZ_RUNS the number of cases per property (default 1000). A failure prints
// the seed and the smallest input that still fails.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHTML, html } from '../../src/dom.js';
import { adversarial, daySeed, prng } from '../fixtures/fuzz.js';

const SEED = Number(process.env.FUZZ_SEED) || daySeed();
const RUNS = Number(process.env.FUZZ_RUNS) || 1000;

// ---------------------------------------------------------------- inputs

// Interpolated values are generated as plain data, so the shrinker can work on
// them: a string, a number, null, { raw } for html.raw, { nested } for an html
// result, or an array of those.
/** @typedef {string | number | null | { raw: string } | { nested: Value } | Value[]} Value */

/** @param {ReturnType<typeof prng>} random @param {number} [depth] @returns {Value} */
function value(random, depth = 0) {
    const roll = random.next();
    if (roll < 0.55 || depth > 2) return adversarial(random);
    if (roll < 0.62) return random.int(1000);
    if (roll < 0.67) return null;
    if (roll < 0.77) return { raw: adversarial(random) };
    if (roll < 0.87) return { nested: value(random, depth + 1) };
    return Array.from({ length: random.int(3) + 1 }, () => value(random, depth + 1));
}

/** The value `html` receives. @param {Value} v @returns {unknown} */
const materialize = (v) =>
    Array.isArray(v) ? v.map(materialize) : v && typeof v === 'object' ? ('raw' in v ? html.raw(v.raw) : html`${materialize(v.nested)}`) : v;

/** The markup `html` produces for v in text. @param {Value} v @returns {string} */
const textMarkup = (v) =>
    Array.isArray(v) ? v.map(textMarkup).join('') : v == null ? '' : typeof v === 'object' ? ('raw' in v ? v.raw : textMarkup(v.nested)) : escapeHTML(v);

/** What the browser reads back from an attribute holding v. @param {Value} v @returns {string} */
const attrText = (v) =>
    Array.isArray(v) ? v.map(attrText).join('') : v == null ? '' : typeof v === 'object' ? ('raw' in v ? v.raw : textMarkup(v.nested)) : String(v);

/** Decodes the character references a browser would, as far as these tests produce them. @param {string} s */
const decode = (s) =>
    s.replace(/&(?:(amp|lt|gt|quot|#39|colon|tab|newline)|#(x?)([\da-f]+));?/gi, (match, name, hex, digits) => {
        if (name) return /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()];
        const code = parseInt(digits, hex ? 16 : 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '\ufffd';
    });

/**
 * Whether the browser would run this attribute value as script: leading and
 * trailing C0 controls and spaces are stripped and tabs and newlines removed
 * before the scheme is read (WHATWG URL).
 * @param {string} value
 */
function isScriptURL(value) {
    const url = value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '').replace(/[\t\n\r]/g, '');
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url);
    return !!scheme && /^(?:javascript|vbscript)$/i.test(scheme[1]);
}

// ---------------------------------------------------------------- harness

/** Every input one step smaller: a character or an array item removed. @param {any} input @returns {Generator<any>} */
function* smaller(input) {
    if (typeof input === 'string') {
        for (let i = 0; i < input.length; i++) yield input.slice(0, i) + input.slice(i + 1);
    } else if (Array.isArray(input)) {
        for (let i = 0; i < input.length; i++) {
            yield [...input.slice(0, i), ...input.slice(i + 1)];
            for (const item of smaller(input[i])) yield [...input.slice(0, i), item, ...input.slice(i + 1)];
        }
    } else if (input && typeof input === 'object') {
        for (const key of Object.keys(input)) {
            if (key === 'fixed' || key === 'values' || key === 'raw' || key === 'nested') {
                for (const item of smaller(input[key])) yield { ...input, [key]: item };
            }
        }
    }
}

/**
 * Checks a property on RUNS generated inputs. `property` returns an error
 * message, or nothing when the input passes.
 * @param {(random: ReturnType<typeof prng>) => any} generate
 * @param {(input: any) => string | undefined} property
 */
function holds(generate, property) {
    const random = prng(SEED);
    for (let run = 0; run < RUNS; run++) {
        const input = generate(random);
        const error = property(input);
        if (!error) continue;
        let smallest = input;
        for (let improved = true; improved; ) {
            improved = false;
            for (const candidate of smaller(smallest)) {
                if (property(candidate)) {
                    smallest = candidate;
                    improved = true;
                    break;
                }
            }
        }
        assert.fail(`${error}\n  FUZZ_SEED=${SEED} (run ${run})\n  smallest failing input: ${JSON.stringify(smallest)}\n  → ${property(smallest)}`);
    }
}

// ---------------------------------------------------------------- properties

test('escaping round-trips and leaves no significant character behind', () => {
    holds(adversarial, (text) => {
        const escaped = escapeHTML(text);
        if (/[<>"']/.test(escaped)) return `raw character in ${JSON.stringify(escaped)}`;
        if (/&(?!(?:amp|lt|gt|quot|#39);)/.test(escaped)) return `stray & in ${JSON.stringify(escaped)}`;
        if (decode(escaped) !== text) return `does not decode back: ${JSON.stringify(escaped)}`;
    });
});

test('text and attribute values decode back to what was interpolated', () => {
    holds(
        (random) => ({ values: [value(random), value(random)] }),
        ({ values: [inText, inAttr] }) => {
            const out = String(html`<p title="${materialize(inAttr)}">${materialize(inText)}</p>`);
            const match = /^<p title="([^"]*)">([\s\S]*)<\/p>$/.exec(out);
            if (!match) return `unexpected shape: ${out}`;
            if (decode(match[1]) !== attrText(inAttr)) return `attribute reads back as ${JSON.stringify(decode(match[1]))}`;
            if (match[2] !== textMarkup(inText)) return `text is ${JSON.stringify(match[2])}`;
        },
    );
});

test('positions escaping cannot protect always throw', () => {
    const templates = [
        (v) => html`<${v}>`,
        (v) => html`<div ${v}>`,
        (v) => html`<a href=${v}>`,
        (v) => html`<b ONCLICK="${v}">`,
        (v) => html`<iframe SrcDoc="${v}">`,
        (v) => html`<SCRIPT>${v}</SCRIPT>`,
        (v) => html`<style>${v}</style>`,
        (v) => html`<!-- ${v} -->`,
        (v) => html`<a href="${v}"`,
    ];
    holds(
        (random) => ({ values: [value(random)] }),
        ({ values: [v] }) => {
            for (const render of templates) {
                try {
                    render(materialize(v));
                    return `no error from ${render}`;
                } catch (error) {
                    if (!(error instanceof TypeError)) return `unexpected ${error}`;
                }
            }
        },
    );
});

const URL_NAMES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'ping', 'data', 'to', 'values', 'HREF', 'Src'];
// Fixed text a template author could write inside a URL attribute; never the quote itself.
const FIXED = ['', '', ' ', '/', '/p?q=', 'java', 'script', ':', 'javascript:', '&#106;', '&colon;', '&amp;', '#', '\t', ';', 'x'];

test('a URL attribute that would run as script is always refused, however it is assembled', () => {
    holds(
        (random) => {
            const count = random.int(3) + 1;
            return {
                attr: random.pick(URL_NAMES),
                quote: random.pick(['"', "'"]),
                fixed: Array.from({ length: count + 1 }, () => random.pick(FIXED) + (random.chance(0.2) ? random.pick(FIXED) : '')),
                values: Array.from({ length: count }, () => value(random)),
            };
        },
        ({ attr, quote, fixed, values }) => {
            if (fixed.length !== values.length + 1) return; // the shrinker removed an item: not a template
            const strings = [`<a ${attr}=${quote}${fixed[0]}`, ...fixed.slice(1, -1), `${fixed[fixed.length - 1]}${quote}>x</a>`];
            let expected = decode(fixed[0]);
            values.forEach((v, i) => (expected += attrText(v) + decode(fixed[i + 1])));
            const script = (/^values$/i.test(attr) ? expected.split(';') : [expected]).some(isScriptURL);
            let out;
            try {
                out = String(html(strings, ...values.map(materialize)));
            } catch (error) {
                if (/refusing the URL/.test(String(error))) return; // refusing is always safe
                return `unexpected ${error}`;
            }
            if (script) return `rendered a script URL: ${out}`;
            const start = `<a ${attr}=${quote}`;
            const value = out.slice(start.length, out.length - `${quote}>x</a>`.length);
            if (decode(value) !== expected) return `attribute reads back as ${JSON.stringify(decode(value))}, expected ${JSON.stringify(expected)}`;
        },
    );
});

test('a cached template and a fresh analysis of the same markup always agree', () => {
    const cached = (a, b) => html`<a href="/p/${a}" title="${b}">${a}</a>`;
    holds(
        (random) => ({ values: [value(random), value(random)] }),
        ({ values: [a, b] }) => {
            const outcome = (render) => {
                try {
                    return String(render());
                } catch (error) {
                    return `throws ${error}`;
                }
            };
            const fromCache = outcome(() => cached(materialize(a), materialize(b)));
            const fresh = outcome(() => html(['<a href="/p/', '" title="', '">', '</a>'], materialize(a), materialize(b), materialize(a)));
            if (fromCache !== fresh) return `cached ${fromCache} but fresh ${fresh}`;
        },
    );
});
