/**
 * Turns docs/*.md, the documentation's only source, into the site's content
 * collection: each page's first heading becomes its title, its links are
 * rewritten for the site (other pages, the live examples, or the file on
 * GitHub), and the sidebar follows docs/README.md. The files keep reading the
 * same on GitHub. A link to a page that does not exist, or a page the index
 * does not list, stops the build.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DOCS = join(HERE, '..', 'docs');
export const OUT = join(HERE, 'src', 'content', 'docs');
export const BASE = '/CycleWire/docs/';
const REPO = 'https://github.com/CycleChain/CycleWire';
const LIVE = 'https://cyclechain.github.io/CycleWire/';

const slugOf = (/** @type {string} */ file) => (file === 'README.md' ? '' : basename(file, '.md'));
const exists = (/** @type {string} */ path) => stat(path).then(() => true, () => false);

/**
 * Where a link in docs/<file> goes on the site.
 * @param {string} href
 * @param {Set<string>} pages the files in docs/
 * @returns {Promise<string>}
 */
export async function rewrite(href, pages) {
    if (/^(?:[a-z][\w+.-]*:|#)/i.test(href)) return href;
    const [path, hash = ''] = href.split('#');
    const anchor = hash ? `#${hash}` : '';
    if (!path.includes('/')) {
        if (!pages.has(path)) throw new Error(`a link to ${path}, which is not in docs/`);
        return `${BASE}${slugOf(path) ? `${slugOf(path)}/` : ''}${anchor}`;
    }
    const target = posix.normalize(posix.join('docs', path));
    if (target.startsWith('..')) throw new Error(`a link out of the repository: ${href}`);
    if (!(await exists(join(DOCS, '..', target)))) throw new Error(`a link to ${target}, which does not exist`);
    // Example folders are live on the site; everything else is read on GitHub.
    const example = /^examples\/(?:README\.md$|[\w-]+\/(?:README\.md)?$)/.exec(target);
    if (example) return `${LIVE}${target.replace(/README\.md$/, '')}${anchor}`;
    return `${REPO}/${path.endsWith('/') ? 'tree' : 'blob'}/main/${target}${anchor}`;
}

/**
 * Rewrites every Markdown link outside code.
 * @param {string} markdown
 * @param {Set<string>} pages
 * @param {string} file for messages
 */
async function links(markdown, pages, file) {
    const parts = markdown.split(/(^```[\s\S]*?^```$)/m);
    for (let i = 0; i < parts.length; i += 2) {
        const hrefs = [...parts[i].matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
        const rewritten = new Map();
        for (const href of hrefs) {
            try {
                rewritten.set(href, await rewrite(href, pages));
            } catch (error) {
                throw new Error(`docs/${file} has ${/** @type {Error} */ (error).message}.`);
            }
        }
        // Inline code keeps its text: only links outside backticks are rewritten.
        parts[i] = parts[i].replace(/(`[^`\n]*`)|\]\(([^)\s]+)\)/g, (match, code, href) => (code ? match : `](${rewritten.get(href)})`));
    }
    return parts.join('');
}

/** Plain text from a line of Markdown: no links, code marks or emphasis. */
const plain = (/** @type {string} */ text) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim();

/**
 * The sidebar: a group per `##` section of docs/README.md, an item per list
 * entry, labelled and linked by the entry's first link.
 * @param {string} index docs/README.md
 * @param {Set<string>} pages
 */
async function sidebar(index, pages) {
    /** @type {{ label: string, items: ({ label: string, slug: string } | { label: string, link: string, attrs?: Record<string, string> })[] }[]} */
    const groups = [];
    for (const line of index.split('\n')) {
        const heading = /^## (.+)$/.exec(line);
        if (heading) {
            groups.push({ label: plain(heading[1]), items: [] });
            continue;
        }
        const entry = /^\s*(?:[-*]|\d+\.)\s+\[([^\]]+)\]\(([^)\s]+)\)/.exec(line);
        if (!entry || !groups.length) continue;
        const [, label, href] = entry;
        const path = href.split('#')[0];
        const item = !path.includes('/') && pages.has(path)
            ? { label: plain(label), slug: slugOf(path) || 'index' }
            : { label: plain(label), link: await rewrite(href, pages), attrs: { rel: 'external' } };
        groups.at(-1)?.items.push(item);
    }
    return groups.filter((group) => group.items.length);
}

/**
 * Writes the content collection and returns the sidebar.
 * @returns {Promise<{ sidebar: Awaited<ReturnType<typeof sidebar>>, pages: string[] }>}
 */
export async function sync() {
    const files = (await readdir(DOCS)).filter((file) => file.endsWith('.md')).sort();
    const pages = new Set(files);
    const index = await readFile(join(DOCS, 'README.md'), 'utf8');
    const groups = await sidebar(index, pages);
    const listed = new Set(groups.flatMap((group) => group.items.map((item) => ('slug' in item ? item.slug : ''))));
    const unlisted = files.filter((file) => file !== 'README.md' && !listed.has(slugOf(file)));
    if (unlisted.length) throw new Error(`docs/README.md does not list ${unlisted.map((file) => `docs/${file}`).join(', ')}, so the site's sidebar would not either.`);

    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });
    for (const file of files) {
        const source = await readFile(join(DOCS, file), 'utf8');
        const heading = /^# (.+)$/m.exec(source);
        if (!heading) throw new Error(`docs/${file} has no title: start it with "# Title".`);
        const body = source.slice(0, heading.index) + source.slice(heading.index + heading[0].length);
        const first = body.trim().split(/\n\s*\n/).find((block) => /^[A-Za-z`*[]/.test(block.trim()));
        const description = first ? plain(first.replace(/\s+/g, ' ')).slice(0, 200) : '';
        const front = [
            '---',
            `title: ${JSON.stringify(plain(heading[1]))}`,
            ...(description ? [`description: ${JSON.stringify(description)}`] : []),
            `editUrl: ${JSON.stringify(`${REPO}/edit/main/docs/${file}`)}`,
            ...(file === 'README.md' ? ['tableOfContents: false'] : []),
            '---',
            '',
        ].join('\n');
        await writeFile(join(OUT, `${slugOf(file) || 'index'}.md`), front + (await links(body.replace(/^\s+/, ''), pages, file)));
    }
    return { sidebar: groups, pages: files };
}
