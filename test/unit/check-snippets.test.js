import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSnippets } from '../../scripts/check-snippets.js';

/** @type {Record<string, string>} */
const FILES = { 'cw.php': '<?php\n\necho 1;\n', 'fence.md': '```js\nx\n```\n' };

/** @param {string} path */
async function read(path) {
    if (!(path in FILES)) throw Object.assign(new Error(`no ${path}`), { code: 'ENOENT' });
    return FILES[path];
}

/** @param {string[]} lines */
const doc = (...lines) => lines.join('\n');

test('a block that holds its file passes, trailing newlines aside', async () => {
    const markdown = doc('# PHP', '', '<!-- snippet: cw.php -->', '```php', '<?php', '', 'echo 1;', '```', '', 'Then use it.');
    assert.deepEqual(await checkSnippets(markdown, read), { checked: 1, problems: [] });
});

test('a longer fence can quote a file that holds a fence', async () => {
    const markdown = doc('<!-- snippet: fence.md -->', '````md', '```js', 'x', '```', '````');
    assert.deepEqual(await checkSnippets(markdown, read), { checked: 1, problems: [] });
});

test('a block that differs from its file is reported with the first differing line', async () => {
    const markdown = doc('Intro', '<!-- snippet: cw.php -->', '```php', '<?php', '', 'echo 2;', '```');
    const { checked, problems } = await checkSnippets(markdown, read);
    assert.equal(checked, 1);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].line, 2);
    assert.match(problems[0].message, /^cw\.php: the code block differs from the file at its line 3/);
    assert.match(problems[0].message, /file: "echo 1;"\n {2}docs: "echo 2;"/);
});

test('a block cut short, or longer than its file, is a difference too', async () => {
    const short = doc('<!-- snippet: cw.php -->', '```php', '<?php', '```');
    const long = doc('<!-- snippet: cw.php -->', '```php', '<?php', '', 'echo 1;', 'echo 2;', '```');
    assert.match((await checkSnippets(short, read)).problems[0].message, /line 2:\n {2}file: ""\n {2}docs: "\(end of block\)"/);
    assert.match((await checkSnippets(long, read)).problems[0].message, /line 4:\n {2}file: "\(end of file\)"/);
});

test('a marker needs a block after it and a file it can read, and must be a line of its own', async () => {
    const problems = async (/** @type {string} */ markdown) => (await checkSnippets(markdown, read)).problems.map((p) => p.message);
    assert.match((await problems(doc('<!-- snippet: cw.php -->', '', '```php', '```')))[0], /followed by a fenced code block/);
    assert.match((await problems(doc('<!-- snippet: cw.php -->', '```php', '<?php')))[0], /never closed/);
    assert.match((await problems(doc('<!-- snippet: gone.php -->', '```php', '```')))[0], /^gone\.php: cannot read the file \(ENOENT\)/);
    assert.match((await problems(doc('  <!-- snippet:cw.php -->', '```php', '```')))[0], /line of its own/);
});
