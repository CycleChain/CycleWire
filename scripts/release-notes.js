#!/usr/bin/env node
/**
 * Prints GitHub release notes for a tag: the version's CHANGELOG section, how
 * to install it, and Subresource Integrity hashes for the CDN files.
 *
 *   node scripts/release-notes.js v1.2.0 [dist-directory]
 *
 * The workflow passes the dist/ folder of the tarball npm serves, so the
 * hashes match what jsDelivr and unpkg deliver.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [tag, dist = 'dist'] = process.argv.slice(2);
if (!tag) {
    console.error('Usage: node scripts/release-notes.js <tag> [dist-directory]');
    process.exit(1);
}
const version = tag.replace(/^v/, '');

const changelog = await readFile('CHANGELOG.md', 'utf8');
const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\].*$`, 'm');
const match = heading.exec(changelog);
if (!match) {
    console.error(`CHANGELOG.md has no section for ${version}.`);
    process.exit(1);
}
const rest = changelog.slice(match.index + match[0].length);
const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
const section = (end < 0 ? rest : rest.slice(0, end)).trim();

// Every bundle the package ships, so a new module can't be left out: the
// core classic script first, then the other classic scripts, the core module
// and the modules by name.
const rank = (file) =>
    file === 'cyclewire.global.min.js' ? 0 : file.endsWith('.global.min.js') ? 1 : file === 'cyclewire.min.js' ? 2 : 3;
const files = (await readdir(dist))
    .filter((file) => file.endsWith('.min.js'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const sri = {};
for (const file of files) {
    sri[file] = `sha384-${createHash('sha384').update(await readFile(join(dist, file))).digest('base64')}`;
}
const cdn = (file) => `https://cdn.jsdelivr.net/npm/cyclewire@${version}/dist/${file}`;

console.log(`${section}

## Install

\`\`\`bash
npm install cyclewire@${version}
\`\`\`

\`\`\`html
<script src="${cdn('cyclewire.global.min.js')}"
        integrity="${sri['cyclewire.global.min.js']}"
        crossorigin="anonymous" defer></script>
\`\`\`

## Subresource Integrity

| File | SRI |
| --- | --- |
${files.map((file) => `| [\`${file}\`](${cdn(file)}) | \`${sri[file]}\` |`).join('\n')}

Full changelog: [CHANGELOG.md](https://github.com/CycleChain/CycleWire/blob/${tag}/CHANGELOG.md)`);
