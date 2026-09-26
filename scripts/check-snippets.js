#!/usr/bin/env node
/**
 * Keeps the code in docs/server-helpers.md identical to the tested files it
 * comes from. A line `<!-- snippet: test/snippets/php/cw.php -->` names a file,
 * and the fenced code block right after it must hold that file's content,
 * trailing newlines aside. Exits 1 when a block has drifted.
 *
 *   node scripts/check-snippets.js
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MARKER = /^<!-- snippet: (\S+) -->$/;
const FENCE = /^(`{3,}|~{3,})/;

/** @param {string} text */
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\n+$/, '');

/**
 * Whether `line` closes a block opened with `fence`: the same character, at
 * least as many times, and nothing else.
 * @param {string} line @param {string} fence
 */
const closes = (line, fence) => {
    const text = line.trimEnd();
    return text.length >= fence.length && text === fence[0].repeat(text.length);
};

/**
 * Compares every marked block in `markdown` with the file it names.
 * @param {string} markdown
 * @param {(path: string) => Promise<string>} read reads a file named by a marker
 * @returns {Promise<{ checked: number, problems: { line: number, message: string }[] }>}
 */
export async function checkSnippets(markdown, read) {
    const lines = normalize(markdown).split('\n');
    /** @type {{ line: number, message: string }[]} */
    const problems = [];
    let checked = 0;
    for (const [index, text] of lines.entries()) {
        if (!text.trimStart().startsWith('<!-- snippet')) continue;
        const path = MARKER.exec(text)?.[1];
        if (!path) {
            // A marker the pattern misses would leave its block unchecked.
            problems.push({ line: index + 1, message: 'write the marker on a line of its own: <!-- snippet: path/to/file -->' });
            continue;
        }
        checked++;
        /** @param {string} message */
        const report = (message) => problems.push({ line: index + 1, message: `${path}: ${message}` });

        const fence = FENCE.exec(lines[index + 1] ?? '')?.[1];
        if (!fence) {
            report('the marker must be followed by a fenced code block.');
            continue;
        }
        let end = index + 2;
        while (end < lines.length && !closes(lines[end], fence)) end++;
        if (end === lines.length) {
            report('the code block is never closed.');
            continue;
        }

        let file;
        try {
            file = normalize(await read(path)).split('\n');
        } catch (error) {
            report(`cannot read the file (${/** @type {any} */ (error).code ?? error}).`);
            continue;
        }
        const block = normalize(lines.slice(index + 2, end).join('\n')).split('\n');
        let at = 0;
        while (at < file.length && at < block.length && file[at] === block[at]) at++;
        if (at < file.length || at < block.length) {
            report(`the code block differs from the file at its line ${at + 1}:\n`
                + `  file: ${JSON.stringify(file[at] ?? '(end of file)')}\n`
                + `  docs: ${JSON.stringify(block[at] ?? '(end of block)')}\n`
                + '  Copy the file into the block again.');
        }
    }
    return { checked, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const root = new URL('../', import.meta.url);
    const doc = 'docs/server-helpers.md';
    const { checked, problems } = await checkSnippets(
        await readFile(new URL(doc, root), 'utf8'),
        (path) => readFile(new URL(path, root), 'utf8'),
    );
    for (const { line, message } of problems) console.error(`${doc}:${line}: ${message}`);
    if (!checked) console.error(`${doc} has no <!-- snippet: path --> markers.`);
    if (problems.length || !checked) process.exit(1);
    console.log(`${doc}: ${checked} snippets match their files.`);
}
