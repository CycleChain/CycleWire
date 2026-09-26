#!/usr/bin/env node
/**
 * Builds the benchmark's part of the website from bench/results/*.json, using
 * the newest run of each profile:
 *
 *   section(found)  the Benchmark section of the landing page: for each
 *                   profile a chart, a table, and the metrics on which another
 *                   stack beats CycleWire. It reads without JavaScript;
 *                   CycleWire switches the chart's metric and sorts the tables
 *                   (site/actions/bench.js and sort.js).
 *   buildSite()     writes the raw results the section links to into
 *                   <out>/results/, and <out>/index.html, which sends the old
 *                   results page's address to the section.
 *
 * Uses Node's built-in modules only, so the Pages workflow can run it without
 * installing the benchmark.
 *
 *   node scripts/build-site.js [--local]    print the section's HTML
 *
 * --local also reads *.local.json runs, for a preview of your own results.
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BENCH = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'https://github.com/CycleChain/CycleWire';
const PROFILES = { mobile: 'Mobile', desktop: 'Desktop' };
const JOURNEYS = { cart: 'Add to cart', filter: 'Category filter', search: 'Live search', quickview: 'Quick view', newsletter: 'Newsletter' };
export const OUTCOMES = { effect: 'Handled in the page', navigation: 'Handled by a page load', lost: 'Lost', duplicate: 'Handled twice', error: 'Error' };
const OUTCOME_NOTES = { effect: 'in the page', navigation: 'page load', lost: 'lost', duplicate: 'twice', error: 'error' };

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]);

/** The newest results file for each profile. */
export async function latest(dir, { local = false } = {}) {
    const files = (await readdir(dir).catch(() => [])).filter((file) => file.endsWith('.json') && (local || !file.endsWith('.local.json')));
    const found = {};
    for (const file of files) {
        const results = JSON.parse(await readFile(join(dir, file), 'utf8'));
        if (results.schema !== 'cyclewire-bench/results@1') continue;
        const id = results.profile.id;
        if (!found[id] || results.startedAt > found[id].results.startedAt) found[id] = { file, results };
    }
    return found;
}

/** @typedef {{ n: number, median: number | null, ci95: [number, number] | null }} Summary */

const time = (value) => (value === null || value === undefined ? '–' : `${Math.round(value).toLocaleString('en-US')} ms`);
const kilobytes = (value) => (value === null || value === undefined ? '–' : `${(value / 1000).toFixed(1)} kB`);
const plain = (value) => (value === null || value === undefined ? '–' : Math.round(value).toLocaleString('en-US'));
const score = (value) => (value === null || value === undefined ? '–' : value.toFixed(3));

/** The early taps that waited `offset` ms after first paint; 0 is the tap at once. */
const tapsAt = (summaries, offset) => (offset ? summaries.later?.[offset] : summaries.early);

/** Whether a stack handled every early tap at `offset`, in the page or by a page load. */
const handledEvery = (offset) => (stack) => {
    const { lost = 0, duplicate = 0, error = 0 } = tapsAt(stack.summaries, offset)?.outcomes ?? {};
    return lost + duplicate + error === 0;
};

/**
 * The metrics, in order. `lower` is better for every one of them. A metric
 * with `eligible` only compares the stacks it accepts.
 * @typedef {{ id: string, label: string, read: (summaries: any) => Summary | undefined, format: (value: number) => string, note?: string, eligible?: (stack: any) => boolean }} Metric
 * @type {Metric[]}
 */
export const LOAD = [
    { id: 'fcp', label: 'First Contentful Paint', read: (s) => s.cold.fcp, format: time },
    { id: 'lcp', label: 'Largest Contentful Paint', read: (s) => s.cold.lcp, format: time },
    { id: 'cls', label: 'Layout shift', read: (s) => s.cold.cls, format: score, note: 'CLS' },
    { id: 'tbt', label: 'Total Blocking Time', read: (s) => s.cold.tbt, format: time },
    { id: 'settled', label: 'Settled', read: (s) => s.cold.settled, format: time, note: 'until nothing loads or runs' },
    { id: 'js', label: 'JavaScript', read: (s) => s.cold['bytes.script.transfer'], format: kilobytes, note: 'on the wire' },
    { id: 'total', label: 'All bytes', read: (s) => s.cold['bytes.total.transfer'], format: kilobytes, note: 'on the wire' },
    { id: 'html', label: 'HTML', read: (s) => s.cold['bytes.document.transfer'], format: kilobytes, note: 'on the wire' },
    { id: 'requests', label: 'Requests', read: (s) => s.cold.requests, format: plain },
    { id: 'main', label: 'Main thread', read: (s) => s.cold['mainThread.task'], format: time, note: 'busy while loading' },
    { id: 'script', label: 'Script', read: (s) => s.cold['mainThread.script'], format: time, note: 'on the main thread while loading' },
    { id: 'style', label: 'Style', read: (s) => s.cold['mainThread.style'], format: time, note: 'recalculation while loading' },
    { id: 'layout', label: 'Layout', read: (s) => s.cold['mainThread.layout'], format: time, note: 'while loading' },
];
/** @type {Metric[]} */
export const REPEAT = [
    { id: 'repeat-fcp', label: 'FCP, repeat visit', read: (s) => s.repeat.fcp, format: time },
    { id: 'repeat-bytes', label: 'Bytes, repeat visit', read: (s) => s.repeat['bytes.total.transfer'], format: kilobytes },
    { id: 'heap', label: 'JS heap', read: (s) => s.repeat['memory.heap'], format: kilobytes },
    { id: 'listeners', label: 'Event listeners', read: (s) => s.repeat['memory.listeners'], format: plain },
];
/** @type {Metric[]} */
export const EFFECTS = Object.entries(JOURNEYS).map(([id, label]) => ({ id: `effect-${id}`, label, read: (s) => s.journeys[id]?.effect, format: time }));
/** A tap in the first frame after first paint: a stack that lost or doubled a tap is not compared. @type {Metric} */
export const EARLY = { id: 'early', label: 'Early tap', read: (s) => s.early?.effect, format: time, eligible: handledEvery(0) };

/** "1 s", "1.5 s", "250 ms". */
const after = (ms) => (ms % 1000 ? (ms > 1000 ? `${ms / 1000} s` : `${ms} ms`) : `${ms / 1000} s`);

/**
 * The early taps of a run: at once, then one metric per later offset, each
 * compared among the stacks that handled every tap at that offset.
 * @returns {Metric[]}
 */
export function taps(results) {
    const offsets = new Set(results.config?.offsets ?? []);
    for (const stack of results.stacks) for (const offset of Object.keys(stack.summaries?.later ?? {})) offsets.add(Number(offset));
    const later = [...offsets].filter(Boolean).sort((a, b) => a - b).map((offset) => ({
        id: `early-${offset}`,
        label: `Early tap, ${after(offset)} later`,
        read: (s) => tapsAt(s, offset)?.effect,
        format: time,
        eligible: handledEvery(offset),
        offset,
    }));
    return [{ ...EARLY, offset: 0 }, ...later];
}

const byId = (metrics, id) => metrics.find((metric) => metric.id === id);
const has = (summary) => Boolean(summary?.n) && summary.median !== null && summary.median !== undefined;

/** Whether two confidence intervals overlap. */
const overlaps = (a, b) => !a.ci95 || !b.ci95 || (a.ci95[0] <= b.ci95[1] && b.ci95[0] <= a.ci95[1]);

/** Smaller differences are not reported, however narrow the intervals: 1 ms in 250 is not a finding. */
export const MATERIAL = 0.03;

/**
 * Whether `a` is clearly lower than `b`: a lower median, 95% confidence
 * intervals that do not overlap, and a difference of at least 3% of `b`.
 * @param {Summary | undefined} a
 * @param {Summary | undefined} b
 */
export function beats(a, b) {
    if (!has(a) || !has(b) || a.median >= b.median || overlaps(a, b)) return false;
    return b.median - a.median >= b.median * MATERIAL;
}

/** The stacks a metric compares: not the controls, which are baselines rather than choices. */
const rivalsOf = (stacks, metric) => stacks.filter((stack) => stack.kind !== 'control' && (!metric.eligible || metric.eligible(stack)));

/** CycleWire, or another way to build the page with it. */
const isOurs = (stack) => stack.id === 'cyclewire' || stack.variant?.of === 'cyclewire';

/**
 * Where CycleWire is not the best: metrics on which another stack that is
 * not a control beats it (see `beats`). For each, the stack with the lowest
 * median among those that do. CycleWire's own variants are not another stack.
 */
export function notBest(results) {
    const stacks = results.stacks.filter((stack) => stack.measured);
    const cyclewire = stacks.find((stack) => stack.id === 'cyclewire');
    if (!cyclewire) return [];
    const findings = [];
    for (const metric of [...LOAD, ...EFFECTS, ...taps(results), ...REPEAT]) {
        const ours = metric.read(cyclewire.summaries);
        if (!has(ours)) continue;
        let best = null;
        for (const stack of rivalsOf(stacks, metric)) {
            if (isOurs(stack)) continue;
            const theirs = metric.read(stack.summaries);
            if (beats(theirs, ours) && (!best || theirs.median < best.summary.median)) best = { stack, summary: theirs };
        }
        if (best) findings.push({ metric, ours, best });
    }
    return findings;
}

/** The stacks, controls aside, that no other such stack beats on a metric: the ones a table marks in bold. */
export function leaders(stacks, metric) {
    const rivals = rivalsOf(stacks, metric).filter((stack) => has(metric.read(stack.summaries)));
    return new Set(rivals.filter((stack) => !rivals.some((other) => beats(metric.read(other.summaries), metric.read(stack.summaries)))).map((stack) => stack.id));
}

/** How the early taps at `offset` were handled, the most common outcome first: "in the page", "page load 2/15", … */
const outcomeNote = (offset) => (stack) => {
    const outcomes = tapsAt(stack.summaries, offset)?.outcomes ?? {};
    const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
    return Object.entries(outcomes).filter(([, count]) => count).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => (count === total ? OUTCOME_NOTES[outcome] : `${OUTCOME_NOTES[outcome]} ${count}/${total}`)).join(', ');
};

/** Column headings, where the label is too long for one. */
const SHORT = {
    js: 'JavaScript', lcp: 'LCP', tbt: 'TBT', fcp: 'FCP', cls: 'CLS', total: 'All bytes',
    'effect-filter': 'Filter', 'effect-search': 'Search', 'repeat-fcp': 'FCP', 'repeat-bytes': 'Bytes', listeners: 'Listeners',
};
const short = (metric) => ({ ...metric, short: SHORT[metric.id] ?? metric.label });

/** The chart's metrics, which are also the columns of the main table. */
const KEY = [
    { ...short(byId(LOAD, 'js')), title: 'JavaScript downloaded on load', group: 'Loading' },
    { ...short(byId(LOAD, 'lcp')), title: 'Largest Contentful Paint', group: 'Loading' },
    { ...short(byId(LOAD, 'tbt')), title: 'Total Blocking Time', group: 'Loading' },
    ...EFFECTS.map((metric) => ({ ...short(metric), title: `Time to effect: ${metric.label.toLowerCase()}`, group: 'Time to effect' })),
    { ...short(EARLY), title: 'Early tap: time to effect', note: outcomeNote(0) },
];
/** Everything else, in a second table. */
const MORE = [
    ...['fcp', 'cls', 'settled', 'total', 'html', 'requests'].map((id) => ({ ...short(byId(LOAD, id)), group: 'Cold load' })),
    ...['main', 'script', 'style', 'layout'].map((id) => ({ ...short(byId(LOAD, id)), group: 'Main thread while loading' })),
    ...REPEAT.map((metric) => ({ ...short(metric), group: 'Repeat visit' })),
];

/** The early taps' columns: at once, then each later offset. */
const tapColumns = (results) => taps(results).map((metric) => ({
    ...metric,
    short: metric.offset ? `${after(metric.offset)} later` : 'At once',
    title: metric.offset ? `Tapped ${after(metric.offset)} after first paint` : 'Tapped in the first frame after first paint',
    note: outcomeNote(metric.offset),
    group: 'Tapped after first paint',
}));

/**
 * The column groups and the header: a first row that names the groups, and a
 * second with a sort button per metric. A metric outside any group spans both
 * rows. `data-column` is the column's index in a body row, counting the stack.
 */
function head(metrics) {
    const groups = [];
    for (const metric of metrics) {
        const last = groups.at(-1);
        if (metric.group && last?.name === metric.group) last.size++;
        else groups.push({ name: metric.group, size: 1, metric });
    }
    const sortable = (metric, column, extra = '') => `<th scope="col" data-metric="${esc(metric.id)}" data-column="${column}" data-title="${esc(metric.title ?? metric.label)}"${extra}><button type="button" cw-action="sort">${esc(metric.short)}</button></th>`;
    let column = 1;
    const top = groups.map((group) => {
        const start = column;
        column += group.size;
        return group.name ? `<th scope="colgroup" colspan="${group.size}">${esc(group.name)}</th>` : sortable(group.metric, start, ' rowspan="2"');
    }).join('');
    const second = metrics.map((metric, i) => (metric.group ? sortable(metric, i + 1) : '')).join('');
    const colgroups = `<colgroup></colgroup>${groups.map((group) => `<colgroup${group.size > 1 ? ` span="${group.size}"` : ''}></colgroup>`).join('')}`;
    return `${colgroups}\n<thead><tr><th scope="col" rowspan="2">Stack</th>${top}</tr><tr>${second}</tr></thead>`;
}

function cell(stack, metric, lead, { ci = false } = {}) {
    const summary = metric.read(stack.summaries);
    if (!has(summary)) return '<td data-value="">–</td>';
    const [low, high] = summary.ci95 ?? [summary.median, summary.median];
    const note = typeof metric.note === 'function' ? metric.note(stack) : '';
    return `<td data-value="${summary.median}"${ci ? ` data-low="${low}" data-high="${high}"` : ''}${lead.has(stack.id) ? ' class="is-lead"' : ''}>${esc(metric.format(summary.median))}${note ? ` <small>${esc(note)}</small>` : ''}</td>`;
}

/** "control" or "variant", after a stack's name. */
const tags = (stack) => (stack.kind === 'control' ? ' <span class="tag">control</span>' : stack.variant ? ' <span class="tag">variant</span>' : '');

function table({ id, caption, metrics, stacks, ci }) {
    const leads = metrics.map((metric) => leaders(stacks, metric));
    const rows = stacks.map((stack) => `<tr data-stack="${esc(stack.id)}"${stack.id === 'cyclewire' ? ' class="is-ours"' : ''}><th scope="row">${esc(stack.name)}${tags(stack)}</th>${metrics.map((metric, i) => cell(stack, metric, leads[i], { ci })).join('')}</tr>`).join('\n');
    // The description sits outside the scrolling region, so a narrow screen shows all of it.
    return `<p class="bench__note" id="${id}">${esc(caption)}</p>
<div class="table-wrap bench__table" role="region" aria-labelledby="${id}" tabindex="0"><table aria-labelledby="${id}">
${head(metrics)}
<tbody>
${rows}
</tbody>
</table></div>`;
}

/**
 * A horizontal bar per stack, lowest first, with a whisker for the 95%
 * confidence interval. site/actions/bench.js redraws it from the table's
 * cells, the same way, when another metric is picked.
 */
function chart({ stacks, metric }) {
    const data = stacks.map((stack) => ({ stack, summary: metric.read(stack.summaries) }));
    const value = ({ summary }) => (has(summary) ? summary.median : null);
    data.sort((a, b) => (value(a) === null) - (value(b) === null) || value(a) - value(b));
    const max = Math.max(0, ...data.map(({ summary }) => (has(summary) ? (summary.ci95?.[1] ?? summary.median) : 0)));
    const percent = (number) => `${max ? ((number / max) * 100).toFixed(2) : 0}%`;
    const bars = data.map(({ stack, summary }) => {
        const kind = stack.id === 'cyclewire' ? 'ours' : isOurs(stack) ? 'variant' : stack.kind === 'control' ? 'control' : 'other';
        const median = has(summary) ? summary.median : 0;
        const [low, high] = has(summary) ? (summary.ci95 ?? [median, median]) : [0, 0];
        const note = typeof metric.note === 'function' && has(summary) ? metric.note(stack) : '';
        const shown = has(summary) ? metric.format(summary.median) : '–';
        return `<li class="bench__bar bench__bar--${kind}" data-stack="${esc(stack.id)}"><span class="bench__name">${esc(stack.name)}</span><span class="bench__track" aria-hidden="true"><span class="bench__fill" style="width:${percent(median)}"></span><span class="bench__ci" style="left:${percent(low)};width:${percent(high - low)}"></span></span><span class="bench__value">${esc(shown)}${note ? ` <small>${esc(note)}</small>` : ''}</span></li>`;
    }).join('\n');
    const buttons = KEY.map((item) => `<button type="button" cw-action="bench" data-metric="${esc(item.id)}" aria-pressed="${item.id === metric.id}">${esc(item.short)}</button>`).join('');
    return `<figure class="bench__chart card">
<div class="bench__metrics" role="group" aria-label="Metric to chart">${buttons}</div>
<figcaption><span class="bench__title" aria-live="polite">${esc(metric.title)}</span> <span class="muted">· median and 95% confidence interval · lower is better</span></figcaption>
<ol class="bench__bars">
${bars}
</ol>
</figure>`;
}

function findings(results) {
    const list = notBest(results);
    const hasRivals = results.stacks.some((stack) => stack.measured && !isOurs(stack) && stack.kind !== 'control');
    const body = !hasRivals
        ? '<p>This run measured CycleWire only against the controls, so there is nothing to compare it with yet.</p>'
        : !list.length
            ? '<p>No other stack beat CycleWire on any metric in this run.</p>'
            : `<ul>${list.map(({ metric, ours, best }) => `<li><b>${esc(metric.label)}</b>: ${esc(best.stack.name)} ${esc(metric.format(best.summary.median))}, CycleWire ${esc(metric.format(ours.median))}</li>`).join('')}</ul>`;
    return `<div class="bench__findings">
<h3>Where another stack beats CycleWire</h3>
<p class="muted">Every metric on which a stack that is not a control has a median at least 3% lower, with 95% confidence intervals that do not overlap. For each, the stack with the lowest median.${results.stacks.some((stack) => stack.measured && stack.variant?.of === 'cyclewire') ? ' Variants of the CycleWire app are CycleWire, so they are not listed.' : ''}</p>
${body}
</div>`;
}

/**
 * "Add to cart" tapped when it first appears and again later: the offsets
 * show how long each page takes to handle a tap in the page itself.
 */
function later(id, results, stacks) {
    const columns = tapColumns(results);
    if (columns.length < 2) return '';
    const times = columns.slice(1).map((metric) => after(metric.offset)).join(' and ');
    return `<details class="bench__more">
<summary>Early taps: when "Add to cart" first appears, and ${esc(times)} later</summary>
${table({ id: `bench-${id}-taps-caption`, caption: `${PROFILES[id]}: time from the tap to its effect, median, and how the taps were handled. A tap handled by a page load is the form working without JavaScript. Bold marks the stacks no other stack clearly beats among those that handled every tap, controls aside.`, metrics: columns, stacks, ci: true })}
</details>`;
}

function panel(id, entry) {
    const open = `<div class="bench__panel" data-for="bench-${id}" data-bench="${id}">`;
    if (!entry) return `${open}<p class="muted">Not measured yet.</p></div>`;
    const { results, file } = entry;
    const stacks = results.stacks.filter((stack) => stack.measured);
    const skipped = results.stacks.filter((stack) => !stack.measured);
    const { environment: env, config } = results;
    const date = results.startedAt.slice(0, 10);
    const runner = env.runner === 'github-hosted' ? "GitHub's hosted runner" : env.runner;
    const commit = env.commit ? ` · commit <a href="${REPO}/commit/${esc(env.commit)}"><code>${esc(env.commit.slice(0, 7))}</code></a>` : '';
    const loads = stacks[0]?.summaries.cold.fcp?.n ?? 0;
    return `${open}
<p class="bench__meta">${config.iterations} ${config.iterations === 1 ? 'iteration' : 'iterations'} on ${esc(date)} · ${esc(env.cpu ?? 'unknown CPU')}, ${env.cores} cores, ${esc(runner)} · ${esc(env.browser)}${commit} · <a href="./bench/results/${esc(basename(file))}">raw data (JSON)</a></p>
${skipped.length ? `<p class="bench__warning">Not measured, because they failed a conformance check: ${skipped.map((stack) => esc(stack.name)).join(', ')}.</p>` : ''}
${chart({ stacks, metric: KEY[0] })}
${table({ id: `bench-${id}-caption`, caption: `${PROFILES[id]}: medians of ${loads} loads and ${config.iterations} of each interaction per stack. Lower is better; bold marks the stacks no other stack clearly beats, controls aside.`, metrics: KEY, stacks, ci: true })}
${findings(results)}
${later(id, results, stacks)}
<details class="bench__more">
<summary>More metrics: first paint, layout shift, bytes, requests, the main thread, repeat visits and memory</summary>
${table({ id: `bench-${id}-more-caption`, caption: `${PROFILES[id]}: medians, lower is better. The main thread's time is split by what it spent it on while the page loaded; the rest is parsing, painting and the like. Memory is read after garbage collection on the repeat visit.`, metrics: MORE, stacks })}
</details>
</div>`;
}

function stackList(stacks) {
    const tree = `${REPO}/tree/main/bench/apps`;
    const blob = `${REPO}/blob/main/bench/apps`;
    const items = stacks.map((stack) => {
        const versions = Object.entries(stack.versions ?? {}).map(([name, version]) => `<code>${esc(name)}@${esc(version)}</code>`).join(' ');
        const failed = stack.conformance.checks.filter((check) => !check.passed);
        const checks = failed.length ? `failed ${failed.map((check) => `<code>${esc(check.id)}</code>`).join(', ')}` : `${stack.conformance.checks.length} of ${stack.conformance.checks.length} checks passed`;
        const choices = stack.idioms?.length ? ` · <a href="${blob}/${esc(stack.id)}/bench.json">${stack.idioms.length} documented ${stack.idioms.length === 1 ? 'choice' : 'choices'}</a>` : '';
        const response = stack.response ? `<blockquote class="bench__response"><p>${esc(stack.response.text)}</p><footer>${stack.response.url ? `<a href="${esc(stack.response.url)}">${esc(stack.response.by)}</a>` : esc(stack.response.by)}</footer></blockquote>` : '';
        const base = stack.variant ? stacks.find((other) => other.id === stack.variant.of) : null;
        const variant = stack.variant ? `<p>A variant of ${esc(base?.name ?? stack.variant.of)}: ${esc(stack.variant.differs)}</p>` : '';
        return `<li><b>${esc(stack.name)}</b>${tags(stack)} ${versions}<p>${esc(stack.summary)}</p>${variant}<p class="bench__links"><a href="${tree}/${esc(stack.id)}">Source</a>${choices} · ${checks}</p>${response}</li>`;
    }).join('\n');
    return `<details class="bench__more">
<summary>How each app is built</summary>
<p class="muted">Each app follows its documentation; every choice it makes is listed, with a link to the page that recommends it, in its <code>bench.json</code>.</p>
<ul class="bench__stacks">
${items}
</ul>
</details>`;
}

/** The landing page's Benchmark section, between its <!-- bench:start --> and <!-- bench:end --> marks. */
export function section(found) {
    const ids = Object.keys(PROFILES);
    if (!ids.some((id) => found[id])) return '<p class="muted">No results have been published yet.</p>';
    const stacks = new Map();
    for (const id of ids) for (const stack of found[id]?.results.stacks ?? []) if (!stacks.has(stack.id)) stacks.set(stack.id, stack);
    const first = ids.find((id) => found[id]);
    const tabs = ids.map((id) => {
        const label = found[id]?.results.profile.label.replace(/^[^:]+:\s*/, '') ?? 'not measured yet';
        return `<input type="radio" name="bench-profile" id="bench-${id}"${id === first ? ' checked' : ''}><label for="bench-${id}">${PROFILES[id]} <small>${esc(label)}</small></label>`;
    }).join('\n');
    return `<div class="bench__tabs">
${tabs}
${ids.map((id) => panel(id, found[id])).join('\n')}
</div>
${stackList([...stacks.values()])}`;
}

/** Where the old results page was: it now points at the landing page's section. */
export const REDIRECT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Benchmark · CycleWire</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://cyclechain.github.io/CycleWire/#benchmark">
<meta http-equiv="refresh" content="0; url=../#benchmark">
</head>
<body>
<p>The benchmark is on <a href="../#benchmark">CycleWire's home page</a>.</p>
</body>
</html>
`;

/**
 * Writes the raw results the section links to, and the redirect, into `out`.
 * @returns {Promise<{ profiles: string[], html: string }>} the profiles found, and the section
 */
export async function buildSite({ out, local = false } = {}) {
    const found = await latest(join(BENCH, 'results'), { local });
    await rm(out, { recursive: true, force: true });
    await mkdir(join(out, 'results'), { recursive: true });
    await writeFile(join(out, 'index.html'), REDIRECT);
    for (const { file } of Object.values(found)) await copyFile(join(BENCH, 'results', file), join(out, 'results', basename(file)));
    return { profiles: Object.keys(found), html: section(found) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    console.log(section(await latest(join(BENCH, 'results'), { local: process.argv.includes('--local') })));
}
