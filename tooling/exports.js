/**
 * The exports of an ES module or TypeScript file, found without running it
 * and without a parser dependency: a small lexer that skips comments,
 * strings, template literals and regular expressions, and reads the export
 * statements at the top level. It reads the forms action modules use; a
 * module that re-exports everything from another (`export * from`) is marked
 * `star`, since its names cannot be known from its own text.
 */

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const DECLARATIONS = new Set(['const', 'let', 'var']);
const IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*/uy;

/**
 * @typedef {{ type: 'id' | 'number' | 'string' | 'punct', value: string, depth: number, line: number }} Token
 */

/**
 * Splits source into identifiers, strings and punctuation, with the nesting
 * depth ({, ( and [) each starts at, and its line.
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
    /** @type {Token[]} */
    const tokens = [];
    /** Depths at which a template literal's `${` opened. @type {number[]} */
    const templates = [];
    let depth = 0;
    let line = 1;
    let i = 0;
    const push = (/** @type {Token['type']} */ type, /** @type {string} */ value) => tokens.push({ type, value, depth, line });
    const regexAllowed = () => {
        const last = tokens.at(-1);
        if (!last) return true;
        // After a value, `/` divides; after an operator or a keyword such as `return`, it starts a pattern.
        if (last.type === 'punct') return !/^[)\]}]$/.test(last.value);
        return last.type === 'id' && KEYWORDS_BEFORE_REGEX.has(last.value);
    };

    /** Reads a template literal's text from `i` up to its end or its next `${`. */
    const template = () => {
        while (i < source.length) {
            const char = source[i];
            if (char === '\\') {
                i += 2;
                continue;
            }
            if (char === '\n') line++;
            if (char === '`') {
                i++;
                push('string', '`');
                return;
            }
            if (char === '$' && source[i + 1] === '{') {
                i += 2;
                templates.push(depth);
                depth++;
                return;
            }
            i++;
        }
    };

    while (i < source.length) {
        const char = source[i];
        if (char === '\n') {
            line++;
            i++;
        } else if (/\s/.test(char)) {
            i++;
        } else if (char === '/' && source[i + 1] === '/') {
            while (i < source.length && source[i] !== '\n') i++;
        } else if (char === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end < 0 ? source.length : end + 2;
            for (let j = i; j < stop; j++) if (source[j] === '\n') line++;
            i = stop;
        } else if (char === '"' || char === "'") {
            let j = i + 1;
            let value = '';
            while (j < source.length && source[j] !== char && source[j] !== '\n') {
                if (source[j] === '\\') {
                    value += source[j + 1] ?? '';
                    j += 2;
                } else value += source[j++];
            }
            push('string', value);
            i = j + 1;
        } else if (char === '`') {
            i++;
            template();
        } else if (char === '/' && regexAllowed()) {
            let j = i + 1;
            let inClass = false;
            while (j < source.length && source[j] !== '\n') {
                if (source[j] === '\\') j++;
                else if (source[j] === '[') inClass = true;
                else if (source[j] === ']') inClass = false;
                else if (source[j] === '/' && !inClass) break;
                j++;
            }
            i = j + 1;
            while (i < source.length && /[a-z]/i.test(source[i])) i++;
            push('string', '/');
        } else if (char === '{' || char === '(' || char === '[') {
            push('punct', char);
            depth++;
            i++;
        } else if (char === '}' || char === ')' || char === ']') {
            depth = Math.max(0, depth - 1);
            i++;
            if (char === '}' && templates.length && templates.at(-1) === depth) {
                templates.pop();
                template();
            } else push('punct', char);
        } else {
            IDENTIFIER.lastIndex = i;
            const match = IDENTIFIER.exec(source);
            if (match) {
                push('id', match[0]);
                i += match[0].length;
            } else if (/[0-9]/.test(char)) {
                let j = i;
                while (j < source.length && /[\w.]/.test(source[j])) j++;
                push('number', source.slice(i, j));
                i = j;
            } else {
                push('punct', char);
                i++;
            }
        }
    }
    return tokens;
}

/**
 * @typedef {object} Exported
 * @property {string} name
 * @property {number} line
 */

/**
 * The value exports of a module (`default` included), in source order, and
 * whether it re-exports everything from another module.
 * @param {string} source
 * @returns {{ exports: Exported[], star: boolean }}
 */
export function exportsOf(source) {
    const tokens = tokenize(source);
    /** @type {Exported[]} */
    const exports = [];
    let star = false;
    const add = (/** @type {string} */ name, /** @type {number} */ line) => {
        if (!exports.some((item) => item.name === name)) exports.push({ name, line });
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== 'id' || token.value !== 'export' || token.depth !== 0) continue;
        // `module.export` or `obj.export` is a property, not a statement.
        if (tokens[i - 1]?.value === '.') continue;
        let j = i + 1;
        const next = () => tokens[j];
        const word = next()?.value;
        // Types only: `export type X = …`, `export type { A }`, `export interface`, `export declare`, `export const enum`.
        if (word === 'declare' || word === 'interface' || (word === 'type' && (tokens[j + 1]?.type === 'id' || tokens[j + 1]?.value === '{'))) continue;
        if (word === 'const' && tokens[j + 1]?.value === 'enum') continue;
        if (word === 'default') {
            add('default', token.line);
        } else if (word === '*') {
            j++;
            if (next()?.value === 'as') add(tokens[j + 1]?.value ?? '', token.line);
            else star = true;
        } else if (word === '{') {
            // export { a, b as c, type T, d as default } [from '…']
            j++;
            while (j < tokens.length && tokens[j].value !== '}') {
                if (tokens[j].value === 'type' && tokens[j + 1]?.type === 'id' && tokens[j + 1].value !== 'as' && tokens[j + 1].value !== ',') {
                    // An inline type modifier: skip the whole specifier.
                    while (j < tokens.length && tokens[j].value !== ',' && tokens[j].value !== '}') j++;
                    if (tokens[j]?.value === ',') j++;
                    continue;
                }
                const local = tokens[j];
                let exported = local.value;
                if (tokens[j + 1]?.value === 'as') {
                    exported = tokens[j + 2]?.value ?? exported;
                    j += 3;
                } else j++;
                if (local.type === 'id' || local.type === 'string') add(exported, local.line);
                if (tokens[j]?.value === ',') j++;
            }
        } else if (word === 'async' && tokens[j + 1]?.value === 'function') {
            j += 2;
            if (next()?.value === '*') j++;
            if (next()?.type === 'id') add(next().value, token.line);
        } else if (word === 'function' || word === 'class' || word === 'enum' || word === 'abstract') {
            j++;
            if (word === 'abstract' && next()?.value === 'class') j++;
            if (next()?.value === '*') j++;
            if (next()?.type === 'id') add(next().value, token.line);
        } else if (DECLARATIONS.has(word ?? '')) {
            j++;
            declarators(tokens, j, add);
        }
    }
    return { exports, star };
}

/**
 * The names a `const`/`let`/`var` declaration binds, starting after the
 * keyword: `a = 1, b = 2`, and destructuring patterns.
 * @param {Token[]} tokens
 * @param {number} start
 * @param {(name: string, line: number) => void} add
 */
function declarators(tokens, start, add) {
    const depth = tokens[start]?.depth ?? 0;
    let j = start;
    let expectName = true;
    while (j < tokens.length) {
        const token = tokens[j];
        // Type arguments, as in `defineAction<{ sku: string }, HTMLFormElement>(…)`: their commas separate no declarators.
        if (token.depth === depth && token.value === '<' && (tokens[j - 1]?.type === 'id' || tokens[j - 1]?.value === '>')) {
            j = closing(tokens, j);
            continue;
        }
        if (token.depth === depth && token.type === 'punct' && token.value === ';') return;
        if (token.depth === depth && token.type === 'id' && /^(?:export|import|function|class|const|let|var)$/.test(token.value) && j > start) return;
        if (expectName && token.depth === depth) {
            if (token.type === 'id') add(token.value, token.line);
            else if (token.value === '{' || token.value === '[') pattern(tokens, j, add);
            expectName = false;
        } else if (token.depth === depth && token.value === ',') {
            expectName = true;
        }
        j++;
    }
}

/**
 * The index after the `>` that closes the type arguments opened at `open`,
 * nested ones included; the `>` of an arrow (`=>`) closes nothing.
 * @param {Token[]} tokens
 * @param {number} open
 */
function closing(tokens, open) {
    const depth = tokens[open].depth;
    let angles = 0;
    for (let j = open; j < tokens.length; j++) {
        const token = tokens[j];
        if (token.depth !== depth) continue;
        if (token.value === '<') angles++;
        else if (token.value === '>' && tokens[j - 1]?.value !== '=' && --angles === 0) return j + 1;
        else if (token.value === ';') return j;
    }
    return tokens.length;
}

/**
 * The names a destructuring pattern binds: `{ a, b: c, d = 1, ...e }` binds
 * a, c, d and e; `[f, , g]` binds f and g.
 * @param {Token[]} tokens
 * @param {number} open index of the `{` or `[`
 * @param {(name: string, line: number) => void} add
 */
function pattern(tokens, open, add) {
    const inner = tokens[open].depth + 1;
    const object = tokens[open].value === '{';
    for (let j = open + 1; j < tokens.length && tokens[j].depth >= inner; j++) {
        const token = tokens[j];
        if (token.depth !== inner || token.type !== 'id') {
            if (token.depth === inner && (token.value === '{' || token.value === '[') && (!object || tokens[j - 1]?.value === ':')) pattern(tokens, j, add);
            continue;
        }
        const after = tokens[j + 1]?.value;
        const before = tokens[j - 1]?.value;
        // In an object pattern, `key:` names a property, not a binding; after `=` comes a default value.
        if (object && after === ':') continue;
        if (before === '=') continue;
        if (after === ',' || after === '}' || after === ']' || after === '=' || after === undefined) add(token.value, token.line);
    }
}
