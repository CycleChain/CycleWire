#!/usr/bin/env node
/**
 * Writes the benchmark's summary into the repository's README.md, between
 * <!-- bench:start --> and <!-- bench:end -->: one table per profile with
 * every stack, controls marked, the median of each metric, and the metrics
 * on which another (non-control) stack clearly beats CycleWire. The numbers
 * come from the newest published run of each profile in results/.
 *
 *   node scripts/readme.js            print the section
 *   node scripts/readme.js --write    replace it in ../README.md
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EFFECTS, latest, notBest } from './build-site.js';

const BENCH = fileURLToPath(new URL('..', import.meta.url));
const README = join(BENCH, '..', 'README.md');
const START = '<!-- bench:start -->';
const END = '<!-- bench:end -->';
const OUTCOME = { effect: 'in the page', navigation: 'by a page load', lost: 'lost', duplicate: 'twice', error: 'error' };

const ms = (value) => (value === null || value === undefined ? '–' : `${Math.round(value).toLocaleString('en-US')} ms`);
const kb = (value) => (value === null || value === undefined ? '–' : `${(value / 1000).toFixed(1)} kB`);
const median = (summary) => (summary?.n ? summary.median : null);
const metric = (list, id) => list.find((item) => item.id === id);

/** The early tap in words: how it was handled, the most common outcome first, and how long it took. */
function early({ outcomes, effect }) {
    const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
    if (!total) return '–';
    const parts = Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => (count === total ? OUTCOME[outcome] : `${OUTCOME[outcome]} ${count}/${total}`));
    return `${parts.join(', ')}, ${ms(median(effect))}`;
}

function table({ results }) {
    const stacks = results.stacks.filter((stack) => stack.measured);
    const columns = [
        ['JavaScript', (s) => kb(median(s.cold['bytes.script.transfer']))],
        ['LCP', (s) => ms(median(s.cold.lcp))],
        ['TBT', (s) => ms(median(s.cold.tbt))],
        ...['cart', 'filter', 'search', 'quickview', 'newsletter'].map((id) => [metric(EFFECTS, `effect-${id}`).label, (s) => ms(median(s.journeys[id]?.effect))]),
        ['Early tap', (s) => early(s.early)],
    ];
    const rows = stacks.map((stack) => `| ${stack.kind === 'control' ? `${stack.name} (control)` : stack.name} | ${columns.map(([, read]) => read(stack.summaries)).join(' | ')} |`);
    return [`| Stack | ${columns.map(([label]) => label).join(' | ')} |`, `| --- | ${columns.map(() => '---:').join(' | ')} |`, ...rows].join('\n');
}

function profile(entry, title) {
    const { results } = entry;
    const { environment: env, config } = results;
    const date = results.startedAt.slice(0, 10);
    const found = notBest(results);
    const lines = [
        `**${title}**: ${results.profile.label.replace(/^[^:]+:\s*/, '')}. ${config.iterations} ${config.iterations === 1 ? 'iteration' : 'iterations'} on ${date}, ${env.cpu ?? 'unknown CPU'} (${env.cores} cores, ${env.runner === 'github-hosted' ? "GitHub's hosted runner" : env.runner}), ${env.browser}.`,
        '',
        table(entry),
        '',
    ];
    if (found.length) {
        lines.push(`Where another stack beats CycleWire here, beyond the noise: ${found.map(({ metric: item, ours, best }) => `${item.label} (${best.stack.name} ${item.format(best.summary.median)}, CycleWire ${item.format(ours.median)})`).join('; ')}.`, '');
    }
    return lines.join('\n');
}

/** The section's Markdown, or null when nothing has been published. */
export async function section({ local = false } = {}) {
    const found = await latest(join(BENCH, 'results'), { local });
    const parts = [['mobile', 'Mobile'], ['desktop', 'Desktop']].filter(([id]) => found[id]).map(([id, title]) => profile(found[id], title));
    if (!parts.length) return null;
    return [
        'Medians, lower is better. Time to effect runs from the input to the frame that shows the result;',
        '"Early tap" is a tap on "Add to cart" in the first frame after first paint. Confidence intervals,',
        'every other metric and each stack\'s choices are on the [results page](https://cyclechain.github.io/CycleWire/bench/).',
        '',
        ...parts,
    ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const markdown = await section({ local: process.argv.includes('--local') });
    if (!markdown) {
        console.error('results/ has no published run.');
        process.exit(1);
    }
    if (!process.argv.includes('--write')) {
        console.log(markdown);
    } else {
        const readme = await readFile(README, 'utf8');
        const start = readme.indexOf(START);
        const end = readme.indexOf(END);
        if (start < 0 || end < start) throw new Error(`README.md has no ${START} … ${END} block.`);
        await writeFile(README, `${readme.slice(0, start + START.length)}\n${markdown}\n${readme.slice(end)}`);
        console.log('Updated the benchmark section of README.md');
    }
}
