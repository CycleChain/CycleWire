/**
 * The `cw-*` values in templates, found by scanning their text: HTML,
 * the server template languages (Blade, ERB, Django, Jinja, Twig, Liquid,
 * Handlebars), JavaScript and TypeScript with JSX, Vue, Svelte and Astro.
 * A value written in the template is reported with its position; a value the
 * template language builds is reported as dynamic (`value: null`), since only
 * the running app knows it. The helpers in docs/server-helpers.md (`@cw(…)`,
 * `cw(…)`, `cwAttrs(…)`, `{% cw … %}`) count as `cw-action`.
 */

/**
 * @typedef {'action' | 'trigger' | 'preload' | 'concurrency' | 'debounce' | 'props' | 'prevent' | 'once' | 'swap'} Kind
 */

/**
 * @typedef {object} Reference
 * @property {Kind} kind
 * @property {string} attribute     as written, or the helper: `cw-on-click`, `@cw`, `{% cw %}`
 * @property {string | null} value  null when the template builds the value
 * @property {number} line          1-based
 * @property {number} column        1-based
 */

/** @typedef {'html' | 'blade' | 'php' | 'erb' | 'twig' | 'jinja' | 'liquid' | 'handlebars' | 'vue' | 'svelte' | 'astro' | 'script'} Syntax */

/**
 * The template language a file is written in, from its name.
 * @param {string} file
 * @returns {Syntax}
 */
export function syntaxOf(file) {
    if (/\.blade\.php$/i.test(file)) return 'blade';
    if (/\.php$/i.test(file)) return 'php';
    if (/\.(?:erb|haml|slim)$/i.test(file)) return 'erb';
    if (/\.twig$/i.test(file)) return 'twig';
    if (/\.(?:jinja2?|j2|njk)$/i.test(file)) return 'jinja';
    if (/\.liquid$/i.test(file)) return 'liquid';
    if (/\.(?:hbs|handlebars|mustache)$/i.test(file)) return 'handlebars';
    if (/\.vue$/i.test(file)) return 'vue';
    if (/\.svelte$/i.test(file)) return 'svelte';
    if (/\.astro$/i.test(file)) return 'astro';
    if (/\.[cm]?[jt]sx?$/i.test(file)) return 'script';
    // .html and .htm, which Django templates use too.
    return 'html';
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gm;

/** Comments per syntax: what they hold never runs, so it is not checked. */
const COMMENTS = {
    html: [HTML_COMMENT, /\{#[\s\S]*?#\}/g],
    blade: [HTML_COMMENT, /\{\{--[\s\S]*?--\}\}/g],
    php: [HTML_COMMENT],
    erb: [HTML_COMMENT, /<%#[\s\S]*?%>/g],
    twig: [HTML_COMMENT, /\{#[\s\S]*?#\}/g],
    jinja: [HTML_COMMENT, /\{#[\s\S]*?#\}/g],
    liquid: [HTML_COMMENT, /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g],
    handlebars: [HTML_COMMENT, /\{\{!--[\s\S]*?--\}\}/g, /\{\{![\s\S]*?\}\}/g],
    vue: [HTML_COMMENT, BLOCK_COMMENT, LINE_COMMENT],
    svelte: [HTML_COMMENT, BLOCK_COMMENT, LINE_COMMENT],
    astro: [HTML_COMMENT, BLOCK_COMMENT, LINE_COMMENT],
    script: [BLOCK_COMMENT, LINE_COMMENT],
};

/** Signs that a template language builds (part of) an attribute value, Blade directives such as `@json(…)` included. */
const BUILT = /\{\{|\{%|\{!!|<\?|<%|\$\{|@\{|@\w+\(/;

/** Replaces comments with spaces, keeping every line break, so positions stay right. */
function blank(/** @type {string} */ source, /** @type {Syntax} */ syntax) {
    let out = source;
    for (const pattern of COMMENTS[syntax]) out = out.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
    return out;
}

/**
 * The value of a JavaScript expression when it is a plain string literal,
 * otherwise null: `'cart#add'` and `` `cart#add` `` are static, `name` and
 * `` `cart#${x}` `` are not.
 * @param {string} expression
 */
export function literal(expression) {
    const text = expression.trim();
    const match = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/s.exec(text);
    if (!match || (match[1] === '`' && match[2].includes('${'))) return null;
    return match[2].replace(/\\(.)/g, '$1');
}

/**
 * The index after the `}` that closes the expression opened at `open`,
 * skipping strings and nested braces.
 * @param {string} source
 * @param {number} open
 */
function closeBrace(source, open) {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const char = source[i];
        if (char === '"' || char === "'" || char === '`') {
            for (i++; i < source.length && source[i] !== char; i++) if (source[i] === '\\') i++;
        } else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return i + 1;
    }
    return source.length;
}

/** @param {string} name */
const kindOf = (name) => /** @type {Kind} */ (name.startsWith('on-') ? 'action' : name);

/**
 * Every `cw-*` value and helper call in a template.
 * @param {string} source
 * @param {object} [options]
 * @param {Syntax} [options.syntax] how to read it; `html` by default
 * @param {string} [options.prefix] the attribute prefix, `cw-` by default
 * @returns {Reference[]}
 */
export function referencesIn(source, { syntax = 'html', prefix = 'cw-' } = {}) {
    const text = blank(source, syntax);
    /** @type {Reference[]} */
    const found = [];
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const position = (/** @type {number} */ index) => {
        let low = 0;
        let high = starts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (starts[mid] <= index) low = mid;
            else high = mid - 1;
        }
        return { line: low + 1, column: index - starts[low] + 1 };
    };
    // An empty prefix means data-, as in the browser.
    const quoted = (prefix || 'data-').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attribute = new RegExp(`(?<![\\w:.-])(:|v-bind:)?(${quoted}(action|on-[a-z][\\w:.-]*|trigger|preload|concurrency|debounce|props|prevent|once|swap))(?![\\w-])(?:\\s*=\\s*("[^"]*"|'[^']*'|\\{|[^\\s>"'=<\`]+))?`, 'gi');
    for (const match of text.matchAll(attribute)) {
        const [, bound, name, suffix, raw] = match;
        const index = /** @type {number} */ (match.index) + (bound?.length ?? 0);
        /** @type {string | null} */
        let value;
        if (raw === undefined) value = '';
        else if (raw === '{') {
            const start = /** @type {number} */ (match.index) + match[0].length - 1;
            value = literal(source.slice(start + 1, closeBrace(source, start) - 1));
        } else {
            const quote = raw[0] === '"' || raw[0] === "'";
            const inner = source.slice(/** @type {number} */ (match.index) + match[0].length - raw.length + (quote ? 1 : 0), /** @type {number} */ (match.index) + match[0].length - (quote ? 1 : 0));
            if (bound) value = literal(inner);
            // Svelte reads `{…}` inside a quoted value as an expression.
            else value = BUILT.test(inner) || (syntax === 'svelte' && inner.includes('{')) ? null : inner;
        }
        found.push({ kind: kindOf(suffix.toLowerCase()), attribute: name, value, ...position(index) });
    }

    // Not `obj.cw(…)`, but `...cw(…)` in a JSX spread.
    /** @type {[RegExp, string?][]} */
    const helpers = [[/(?<![\w$])(?<!(?:^|[^.])\.)(@cw|cwAttrs|cw)\s*\(\s*(['"`])((?:\\.|(?!\2)[^\\\n])*)\2/g]];
    if (syntax === 'html' || syntax === 'jinja' || syntax === 'twig') helpers.push([/\{%-?\s*(cw)\s+(['"])((?:\\.|(?!\2)[^\\\n])*)\2/g, '{% cw %}']);
    if (syntax === 'erb') helpers.push([/(?<![\w$.:@])(cw)[ \t]+(['"])((?:\\.|(?!\2)[^\\\n])*)\2/g]);
    for (const [pattern, label] of helpers) {
        for (const match of text.matchAll(pattern)) {
            const [, helper, quote, name] = match;
            const value = quote === '`' && name.includes('${') ? null : name.replace(/\\(.)/g, '$1');
            found.push({ kind: 'action', attribute: label ?? (helper === '@cw' ? '@cw' : `${helper}()`), value, ...position(/** @type {number} */ (match.index)) });
        }
    }
    return found.sort((a, b) => a.line - b.line || a.column - b.column);
}
