// A `visible` trigger on every code sample: this module is fetched when the
// first one scrolls into view, then colours each block as it appears. Tokens
// become <span>s through textContent, so no markup is ever parsed.
const RULES = {
    js: [
        ['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
        ['str', /(['"`])(?:\\.|(?!\1)[^\\\n])*\1/y],
        ['kw', /\b(?:import|from|export|default|async|await|function|const|let|return|new|if|else|for|of|in)\b/y],
        ['fn', /\b[A-Za-z_$][\w$]*(?=\()/y],
        ['num', /\b\d+(?:\.\d+)?\b/y],
    ],
    html: [
        ['com', /<!--[\s\S]*?-->/y],
        ['tag', /<\/?[A-Za-z][\w-]*|\/?>/y],
        ['attr', /[A-Za-z_:][\w:.-]*(?==)/y],
        ['str', /"[^"]*"|'[^']*'/y],
    ],
    sh: [
        ['com', /#[^\n]*/y],
        ['kw', /\b(?:npm|pnpm|yarn|bun|npx)\b/y],
    ],
};

/** @param {string} code @param {keyof RULES} lang */
function tokens(code, lang) {
    const rules = RULES[lang] || [];
    const frag = document.createDocumentFragment();
    let plain = '';
    let i = 0;
    scan: while (i < code.length) {
        for (const [kind, pattern] of rules) {
            pattern.lastIndex = i;
            const match = pattern.exec(code);
            if (!match || !match[0]) continue;
            if (plain) frag.append(plain);
            plain = '';
            const span = document.createElement('span');
            span.className = `tok-${kind}`;
            span.textContent = match[0];
            frag.append(span);
            i += match[0].length;
            continue scan;
        }
        plain += code[i++];
    }
    if (plain) frag.append(plain);
    return frag;
}

export function run({ element }) {
    for (const code of element.querySelectorAll('code[data-lang]')) {
        code.replaceChildren(tokens(code.textContent, code.dataset.lang));
    }
}
