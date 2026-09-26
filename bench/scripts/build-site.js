#!/usr/bin/env node
/**
 * Builds the benchmark's results page from bench/results/*.json: the latest
 * run of each profile, as tables and inline SVG charts that read without
 * JavaScript. CycleWire only sorts the tables and switches the theme. Uses
 * Node's built-in modules only, so the Pages workflow can run it without
 * installing the benchmark.
 *
 *   node scripts/build-site.js [--out <dir>] [--local]
 *
 * --local also reads *.local.json runs, for a preview of your own results.
 * The page lands in <dir>/index.html (default bench/.cache/site), with the
 * sorting action and a copy of the raw results it shows.
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BENCH = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'https://github.com/CycleChain/CycleWire';
const SOURCE = `${REPO}/blob/main/bench`;
const PROFILES = ['mobile', 'desktop'];
const JOURNEYS = { cart: 'Add to cart', filter: 'Category filter', search: 'Live search', quickview: 'Quick view', newsletter: 'Newsletter' };
export const OUTCOMES = { effect: 'Handled in the page', navigation: 'Handled by a page load', lost: 'Lost', duplicate: 'Handled twice', error: 'Error' };

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

/**
 * The metrics shown, in order. `lower` is better for every one of them.
 * @type {Array<{ id: string, label: string, read: (summaries: any) => Summary | undefined, format: (value: number) => string, note?: string }>}
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
];
export const REPEAT = [
    { id: 'repeat-fcp', label: 'FCP, repeat visit', read: (s) => s.repeat.fcp, format: time },
    { id: 'repeat-bytes', label: 'Bytes, repeat visit', read: (s) => s.repeat['bytes.total.transfer'], format: kilobytes },
    { id: 'heap', label: 'JS heap', read: (s) => s.repeat['memory.heap'], format: kilobytes },
    { id: 'listeners', label: 'Event listeners', read: (s) => s.repeat['memory.listeners'], format: plain },
];
export const EFFECTS = Object.entries(JOURNEYS).map(([id, label]) => ({ id: `effect-${id}`, label, read: (s) => s.journeys[id]?.effect, format: time }));

const byId = (metrics, id) => metrics.find((metric) => metric.id === id);

/** Whether two confidence intervals overlap. */
const overlaps = (a, b) => !a.ci95 || !b.ci95 || (a.ci95[0] <= b.ci95[1] && b.ci95[0] <= a.ci95[1]);

/** Smaller differences are not reported, however narrow the intervals: 1 ms in 250 is not a finding. */
export const MATERIAL = 0.03;

/**
 * Where CycleWire is not the best: metrics on which another stack that is
 * not a control has a lower median, with confidence intervals that do not
 * overlap and a difference of at least 3% of CycleWire's median. Controls are
 * baselines, not choices, so they are left out.
 */
export function notBest(results) {
    const stacks = results.stacks.filter((stack) => stack.measured);
    const cyclewire = stacks.find((stack) => stack.id === 'cyclewire');
    if (!cyclewire) return [];
    const rivals = stacks.filter((stack) => stack.id !== 'cyclewire' && stack.kind !== 'control');
    const findings = [];
    for (const metric of [...LOAD, ...EFFECTS, ...REPEAT]) {
        const ours = metric.read(cyclewire.summaries);
        if (!ours?.n || ours.median === null) continue;
        let best = null;
        for (const stack of rivals) {
            const theirs = metric.read(stack.summaries);
            if (!theirs?.n || theirs.median === null || theirs.median >= ours.median || overlaps(ours, theirs)) continue;
            if (ours.median - theirs.median < ours.median * MATERIAL) continue;
            if (!best || theirs.median < best.summary.median) best = { stack, summary: theirs };
        }
        if (best) findings.push({ metric, ours, best });
    }
    return findings;
}

function cell(summary, format, best) {
    if (!summary?.n || summary.median === null) return '<td data-value="">–</td>';
    const [low, high] = summary.ci95 ?? [summary.median, summary.median];
    const isBest = best !== null && summary.median === best;
    return `<td data-value="${summary.median}"${isBest ? ' class="best"' : ''}><span class="value">${esc(format(summary.median))}</span><span class="ci" title="95% confidence interval of the median">${esc(format(low))} – ${esc(format(high))}</span></td>`;
}

function table({ caption, metrics, stacks, id }) {
    const bests = metrics.map((metric) => {
        const medians = stacks.map((stack) => metric.read(stack.summaries)).filter((summary) => summary?.n && summary.median !== null).map((summary) => summary.median);
        return medians.length ? Math.min(...medians) : null;
    });
    const head = metrics.map((metric) => `<th scope="col"><button type="button" data-cw-action="sort">${esc(metric.label)}</button>${metric.note ? `<small>${esc(metric.note)}</small>` : ''}</th>`).join('');
    const rows = stacks.map((stack) => `<tr${stack.id === 'cyclewire' ? ' class="ours"' : ''}><th scope="row"><a href="#stack-${esc(stack.id)}">${esc(stack.name)}</a>${stack.kind === 'control' ? ' <span class="tag">control</span>' : ''}</th>${metrics.map((metric, i) => cell(metric.read(stack.summaries), metric.format, bests[i])).join('')}</tr>`).join('\n');
    return `<div class="table" role="region" aria-labelledby="${id}" tabindex="0"><table>
<caption id="${id}">${esc(caption)}</caption>
<thead><tr><th scope="col">Stack</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table></div>`;
}

/**
 * A horizontal bar chart with confidence whiskers, in HTML so its text stays
 * readable at any width. Decorative: the table under it has the numbers.
 */
function bars({ stacks, metric, title }) {
    const data = stacks.map((stack) => ({ stack, summary: metric.read(stack.summaries) })).filter(({ summary }) => summary?.n && summary.median !== null);
    if (!data.length) return '';
    const max = Math.max(...data.map(({ summary }) => summary.ci95?.[1] ?? summary.median), 1);
    const percent = (value) => `${((value / max) * 100).toFixed(2)}%`;
    const rows = data.map(({ stack, summary }) => {
        const [low, high] = summary.ci95 ?? [summary.median, summary.median];
        const kind = stack.id === 'cyclewire' ? 'ours' : stack.kind === 'control' ? 'control' : 'other';
        return `<div class="bar bar--${kind}"><span class="bar__label">${esc(stack.name)}</span><span class="bar__track"><span class="bar__fill" style="width:${percent(summary.median)}"></span><span class="bar__whisker" style="left:${percent(low)};width:${percent(high - low)}"></span></span><span class="bar__value">${esc(metric.format(summary.median))}</span></div>`;
    }).join('\n');
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption><div class="bars" aria-hidden="true">
${rows}
</div></figure>`;
}

function early(stacks) {
    const rows = stacks.map((stack) => {
        const { outcomes, effect } = stack.summaries.early;
        const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
        const segments = Object.keys(OUTCOMES).filter((outcome) => outcomes[outcome]).map((outcome) => `<span class="outcome outcome--${outcome}" style="flex-grow:${outcomes[outcome]}" title="${esc(OUTCOMES[outcome])}: ${outcomes[outcome]} of ${total}">${esc(OUTCOMES[outcome])} ${Math.round((outcomes[outcome] / total) * 100)}%</span>`).join('');
        return `<tr${stack.id === 'cyclewire' ? ' class="ours"' : ''}><th scope="row"><a href="#stack-${esc(stack.id)}">${esc(stack.name)}</a></th><td class="outcomes"><div class="stack-bar">${segments || '–'}</div></td>${cell(effect, time, null)}</tr>`;
    }).join('\n');
    return `<div class="table" role="region" aria-labelledby="early-caption" tabindex="0"><table>
<caption id="early-caption">What happened to a tap on "Add to cart" in the first frame after first paint</caption>
<thead><tr><th scope="col">Stack</th><th scope="col">Outcome</th><th scope="col"><button type="button" data-cw-action="sort">Time to effect</button></th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>`;
}

function findings(results) {
    const list = notBest(results);
    const hasRivals = results.stacks.some((stack) => stack.measured && stack.id !== 'cyclewire' && stack.kind !== 'control');
    if (!hasRivals) return '<p class="muted">This run measured CycleWire only against the controls, so there is nothing to compare it with yet.</p>';
    if (!list.length) return '<p>In this run, no other stack beat CycleWire on any metric below by more than the noise (95% confidence intervals that overlap, or a difference under 3%).</p>';
    return `<ul class="findings">${list.map(({ metric, ours, best }) => `<li><b>${esc(metric.label)}</b>: ${esc(best.stack.name)} ${esc(metric.format(best.summary.median))}, CycleWire ${esc(metric.format(ours.median))}.</li>`).join('')}</ul>`;
}

function profileSection(id, entry) {
    const title = id === 'mobile' ? 'Mobile' : 'Desktop';
    if (!entry) return `<section class="profile" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2><p class="muted">Not measured yet.</p></section>`;
    const { results, file } = entry;
    const stacks = results.stacks.filter((stack) => stack.measured);
    const skipped = results.stacks.filter((stack) => !stack.measured);
    const { environment: env, config, profile } = results;
    const date = results.startedAt.slice(0, 10);
    const commit = env.commit ? ` · commit <a href="${REPO}/commit/${esc(env.commit)}"><code>${esc(env.commit.slice(0, 7))}</code></a>` : '';
    return `<section class="profile" id="${id}" aria-labelledby="${id}-title">
<header class="profile__head">
<h2 id="${id}-title">${title} <small>${esc(profile.label.replace(/^[^:]+:\s*/, ''))}</small></h2>
<p class="meta">${esc(date)} · ${config.iterations} iterations · ${esc(env.cpu ?? 'unknown CPU')}, ${env.cores} cores (${esc(env.runner)}) · ${esc(env.browser)}${commit} · <a href="results/${esc(basename(file))}">raw results (JSON)</a></p>
</header>
${skipped.length ? `<p class="warning">Not measured, because they failed a conformance check: ${skipped.map((stack) => esc(stack.name)).join(', ')}.</p>` : ''}
<section class="block" aria-labelledby="${id}-findings">
<h3 id="${id}-findings">Where CycleWire is not the best</h3>
<p class="muted">Metrics on which a stack that is not a control has a lower median, with 95% confidence intervals that do not overlap and a difference of at least 3%.</p>
${findings(results)}
</section>
<section class="block" aria-labelledby="${id}-load">
<h3 id="${id}-load">Loading the page</h3>
<p class="muted">A cold visit: empty cache, no cookies. Medians of ${stacks[0]?.summaries.cold.fcp.n ?? 0} loads per stack; the small figures are 95% confidence intervals.</p>
${bars({ stacks, metric: byId(LOAD, 'js'), title: 'JavaScript downloaded on load' })}
${table({ caption: 'Loading metrics per stack (lower is better)', metrics: LOAD, stacks, id: `${id}-load-caption` })}
</section>
<section class="block" aria-labelledby="${id}-effect">
<h3 id="${id}-effect">Time to effect</h3>
<p class="muted">From the input (the finger or the button going down, or the last key) to the frame that shows the result, on a page that has finished loading. A full page load counts, as it does for people.</p>
${bars({ stacks, metric: byId(EFFECTS, 'effect-cart'), title: 'Add to cart' })}
${table({ caption: 'Time to effect per interaction (lower is better)', metrics: EFFECTS, stacks, id: `${id}-effect-caption` })}
</section>
<section class="block" aria-labelledby="${id}-early">
<h3 id="${id}-early">The early tap</h3>
<p class="muted">People tap as soon as they see a button. This tap lands in the first frame after first paint in which "Add to cart" is on screen.</p>
${early(stacks)}
</section>
<section class="block" aria-labelledby="${id}-repeat">
<h3 id="${id}-repeat">Coming back, and memory</h3>
${table({ caption: 'Repeat visit with a warm cache, and memory once settled (lower is better)', metrics: REPEAT, stacks, id: `${id}-repeat-caption` })}
</section>
</section>`;
}

function stackSection(stacks) {
    return stacks.map((stack) => {
        const versions = Object.entries(stack.versions ?? {}).map(([name, version]) => `<code>${esc(name)}@${esc(version)}</code>`).join(' ');
        const failed = stack.conformance.checks.filter((check) => !check.passed);
        return `<article class="stack" id="stack-${esc(stack.id)}">
<h3>${esc(stack.name)}${stack.kind === 'control' ? ' <span class="tag">control</span>' : ''}</h3>
<p>${esc(stack.summary)}</p>
<p class="meta">${versions || 'No packages'} · <a href="${SOURCE}/apps/${esc(stack.id)}">source</a> · conformance: ${failed.length ? `failed ${failed.map((check) => `<code>${esc(check.id)}</code>`).join(', ')}` : `${stack.conformance.checks.length} of ${stack.conformance.checks.length} checks passed`}</p>
${stack.idioms?.length ? `<ul class="idioms">${stack.idioms.map((idiom) => `<li>${esc(idiom.choice)} <a href="${esc(idiom.docs)}">Docs</a></li>`).join('')}</ul>` : ''}
${stack.response ? `<blockquote class="response"><p>${esc(stack.response.text)}</p><footer>${stack.response.url ? `<a href="${esc(stack.response.url)}">${esc(stack.response.by)}</a>` : esc(stack.response.by)}</footer></blockquote>` : ''}
</article>`;
    }).join('\n');
}

const STYLE = `
:root{color-scheme:light;--bg:#f7f8fa;--surface:#fff;--surface-2:#f1f3f7;--border:#e1e5ed;--border-strong:#cbd2de;--text:#0d1321;--muted:#4c5668;--accent:#0f766e;--accent-soft:rgba(15,118,110,.1);--accent-ink:#fff;--spark:#b45309;--danger:#be123c;--other:#64748b;--control:#cbd2de;--radius:14px;--font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#0a0c10;--surface:#11151c;--surface-2:#171c25;--border:#232a36;--border-strong:#333c4a;--text:#e8ebf0;--muted:#a0a9b8;--accent:#5eead4;--accent-soft:rgba(94,234,212,.12);--accent-ink:#042f2b;--spark:#fbbf24;--danger:#fb7185;--other:#94a3b8;--control:#3a4454}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0a0c10;--surface:#11151c;--surface-2:#171c25;--border:#232a36;--border-strong:#333c4a;--text:#e8ebf0;--muted:#a0a9b8;--accent:#5eead4;--accent-soft:rgba(94,234,212,.12);--accent-ink:#042f2b;--spark:#fbbf24;--danger:#fb7185;--other:#94a3b8;--control:#3a4454}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:3px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
code{font-family:var(--mono);font-size:.88em}
h1,h2,h3{line-height:1.15;letter-spacing:-.02em;margin:0}
.wrap{width:min(1120px,100%);margin:0 auto;padding:0 16px}
.muted{color:var(--muted)}
.skip{position:absolute;left:16px;top:-48px;padding:8px 14px;background:var(--accent);color:var(--accent-ink);border-radius:8px;z-index:10}
.skip:focus{top:12px}
.nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.nav .wrap{display:flex;align-items:center;gap:16px;height:56px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:750;text-decoration:none}
.nav__links{display:flex;gap:16px;margin-left:auto;align-items:center}
.nav__links a{color:var(--muted);text-decoration:none;font-size:.93rem;font-weight:550}
.nav__links a[aria-current="page"],.nav__links a:hover{color:var(--text)}
@media (max-width:640px){.nav__links .hide-sm{display:none}}
.icon-btn{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer}
.icon-btn .moon{display:none}
:root[data-theme="dark"] .icon-btn .sun{display:none}
:root[data-theme="dark"] .icon-btn .moon{display:block}
@media (prefers-color-scheme:dark){:root:not([data-theme]) .icon-btn .sun{display:none}:root:not([data-theme]) .icon-btn .moon{display:block}}
.intro{padding:40px 0 8px}
.eyebrow{display:inline-block;font:600 .78rem/1 var(--mono);color:var(--spark);padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface)}
.intro h1{font-size:clamp(2rem,5vw,3rem);margin:16px 0 10px;letter-spacing:-.035em}
.lead{font-size:1.1rem;color:var(--muted);max-width:44em;margin:0}
.notice{margin:28px 0;padding:18px 20px;border:1px solid var(--border);border-left:4px solid var(--spark);border-radius:var(--radius);background:var(--surface)}
.notice h2{font-size:1.1rem;margin-bottom:6px}
.notice ul{margin:0;padding-left:1.1em}
.notice li{margin:.35em 0}
.jump{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
.jump a{padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);text-decoration:none;color:var(--text);font-weight:600;font-size:.92rem}
.profile{padding:28px 0;border-top:1px solid var(--border)}
.profile__head h2{font-size:1.6rem}
.profile__head h2 small{font-size:.95rem;font-weight:500;color:var(--muted);letter-spacing:0}
.meta{color:var(--muted);font-size:.88rem;margin:.4em 0 0}
.warning{color:var(--danger);font-weight:600}
.block{margin-top:28px}
.block h3{font-size:1.2rem;margin-bottom:6px}
.findings li{margin:.3em 0}
.table{overflow-x:auto;margin-top:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.9rem}
caption{text-align:left;padding:10px 14px;color:var(--muted);font-size:.85rem}
th,td{padding:8px 12px;border-top:1px solid var(--border);text-align:right;white-space:nowrap;vertical-align:top}
thead th{border-top:0;font-weight:600;color:var(--text);background:var(--surface-2)}
thead th small{display:block;font-weight:400;color:var(--muted);font-size:.75rem}
th[scope="row"],thead th:first-child{text-align:left}
th button{all:unset;cursor:pointer;font-weight:600}
th button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
th[aria-sort="ascending"] button::after{content:" ↑"}
th[aria-sort="descending"] button::after{content:" ↓"}
td .value{display:block;font-variant-numeric:tabular-nums}
td .ci{display:block;color:var(--muted);font-size:.72rem;font-variant-numeric:tabular-nums}
td.best .value{font-weight:700;color:var(--accent)}
tr.ours th[scope="row"] a{font-weight:700}
.tag{font:600 .68rem/1 var(--mono);color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:2px 5px;vertical-align:middle}
.chart{margin:16px 0 0}
.chart figcaption{font-size:.85rem;color:var(--muted);margin-bottom:6px}
.bars{display:grid;gap:6px}
.bar{display:grid;grid-template-columns:minmax(6em,10em) 1fr 5.5em;align-items:center;gap:10px;font-size:.85rem}
.bar__label{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar__track{position:relative;height:14px}
.bar__fill{position:absolute;top:0;bottom:0;left:0;min-width:1px;border-radius:4px;background:var(--other)}
.bar--ours .bar__fill{background:var(--accent)}
.bar--control .bar__fill{background:var(--control)}
.bar__whisker{position:absolute;top:50%;height:2px;margin-top:-1px;background:var(--text);opacity:.5}
.bar__value{color:var(--muted);font-variant-numeric:tabular-nums}
.outcomes{text-align:left;min-width:260px;white-space:normal}
.stack-bar{display:flex;gap:2px;border-radius:6px;overflow:hidden;font-size:.72rem}
.outcome{padding:3px 6px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.outcome--effect{background:#0f766e}.outcome--navigation{background:#6d28d9}.outcome--lost{background:#be123c}.outcome--duplicate{background:#b45309}.outcome--error{background:#475569}
.stacks{padding:28px 0;border-top:1px solid var(--border)}
.stacks>h2{font-size:1.6rem;margin-bottom:12px}
.stack{padding:16px 0;border-top:1px solid var(--border)}
.stack h3{font-size:1.1rem}
.stack p{margin:.4em 0}
.idioms{margin:.4em 0 0;padding-left:1.1em;color:var(--muted);font-size:.92rem}
.idioms li{margin:.25em 0}
.response{margin:.8em 0 0;padding:.6em 1em;border-left:3px solid var(--accent);background:var(--surface);border-radius:0 8px 8px 0}
.response p{margin:0}
.response footer{margin-top:.3em;color:var(--muted);font-size:.85rem}
footer{padding:32px 0 48px;color:var(--muted);font-size:.9rem;border-top:1px solid var(--border)}
`;

/** The whole page. */
export function page(found) {
    const all = PROFILES.map((id) => found[id]).filter(Boolean);
    const stacks = new Map();
    for (const { results } of all) for (const stack of results.stacks) if (!stacks.has(stack.id)) stacks.set(stack.id, stack);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Benchmark · CycleWire</title>
<meta name="description" content="One server-rendered product page, built with each stack the way its documentation recommends, measured the same way in Chromium: loads, time to effect, the early tap and repeat visits.">
<meta name="theme-color" content="#f7f8fa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0c10" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="The CycleWire benchmark">
<meta property="og:description" content="One product page, built with each stack, measured the same way.">
<meta property="og:image" content="https://cyclechain.github.io/CycleWire/og.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230f766e'/%3E%3Cpath d='M6 20h6l3-8 3 8h8' fill='none' stroke='%23fff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='15' cy='12' r='2.4' fill='%23fbbf24'/%3E%3C/svg%3E">
<script>try { var theme = localStorage.getItem('cw-theme'); if (theme) document.documentElement.dataset.theme = theme; } catch (e) {}</script>
<script type="importmap">{ "imports": { "cyclewire": "../dist/cyclewire.min.js" } }</script>
<link rel="modulepreload" href="../dist/cyclewire.min.js">
<script type="module">
import { start } from 'cyclewire';
start({ actions: { theme: '../actions/theme.js', sort: './sort.js' } });
</script>
<style>${STYLE.trim()}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the results</a>
<header class="nav"><div class="wrap">
<a class="brand" href="../">CycleWire</a>
<nav class="nav__links" aria-label="Main">
<a class="hide-sm" href="../#demos">Demos</a>
<a class="hide-sm" href="../examples/">Examples</a>
<a href="./" aria-current="page">Benchmark</a>
<a class="hide-sm" href="${REPO}/tree/main/docs">Docs</a>
<a href="${REPO}">GitHub</a>
<button type="button" class="icon-btn" data-cw-action="theme" aria-label="Toggle dark mode" aria-pressed="false">
<svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
<svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
</button>
</nav>
</div></header>
<main id="main" class="wrap">
<section class="intro">
<span class="eyebrow">Preview</span>
<h1>Benchmark</h1>
<p class="lead">One server-rendered product page, built with each stack the way its documentation recommends, served through the same proxy and measured the same way in Chromium.</p>
</section>
<aside class="notice" aria-labelledby="first">
<h2 id="first">Read this first</h2>
<ul>
<li><b>Who runs it.</b> The authors of CycleWire, which is one of the stacks measured. The scenario, every app, the runner and the raw data are in the repository, and <a href="${SOURCE}/METHODOLOGY.md">the methodology</a> explains every choice.</li>
<li><b>The page.</b> Wirestore: 50 products with images, live search, seven category filters, a quick view and a newsletter form. Every stack must show the same text and use the same data, stylesheet and images; automatic checks enforce it.</li>
<li><b>No score.</b> Each number is a median with its 95% confidence interval. When intervals overlap, the difference is noise.</li>
<li><b>Limits.</b> Chromium only; network throttling per request inside the browser; shared CI machines; a modelled person (80 ms taps, and on desktop a pointer that rests on its target for 100 ms).</li>
<li><b>Corrections welcome.</b> If an app does not follow its documentation, <a href="${SOURCE}/CONTRIBUTING.md">change it</a>. Framework authors can add a response to their row.</li>
</ul>
</aside>
<nav class="jump" aria-label="Profiles">${PROFILES.map((id) => `<a href="#${id}">${id === 'mobile' ? 'Mobile' : 'Desktop'}</a>`).join('')}<a href="#stacks">Stacks</a></nav>
${PROFILES.map((id) => profileSection(id, found[id])).join('\n')}
<section class="stacks" id="stacks" aria-labelledby="stacks-title">
<h2 id="stacks-title">Stacks</h2>
<p class="muted">How each app is built, and the documentation behind every choice it makes.</p>
${stacks.size ? stackSection([...stacks.values()]) : '<p class="muted">No results yet.</p>'}
</section>
</main>
<footer><div class="wrap">
<p>Reproduce it: <code>cd bench &amp;&amp; npm ci &amp;&amp; npx playwright install chromium &amp;&amp; node run.js</code>. <a href="${SOURCE}/README.md">How to run it</a> · <a href="${SOURCE}/METHODOLOGY.md">Methodology</a> · <a href="${SOURCE}/schema/results.v1.json">Results schema</a></p>
<p>CycleWire is made by <a href="https://cyclechain.io">CycleChain</a>. MIT licensed.</p>
</div></footer>
</body>
</html>
`;
}

/** Writes the page, the sorting action and the results it shows into `out`. */
export async function buildSite({ out, local = false } = {}) {
    const found = await latest(join(BENCH, 'results'), { local });
    await rm(out, { recursive: true, force: true });
    await mkdir(join(out, 'results'), { recursive: true });
    await writeFile(join(out, 'index.html'), page(found));
    await copyFile(join(BENCH, 'site', 'sort.js'), join(out, 'sort.js'));
    for (const { file } of Object.values(found)) await copyFile(join(BENCH, 'results', file), join(out, 'results', basename(file)));
    return Object.keys(found);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const index = process.argv.indexOf('--out');
    const out = index > -1 ? process.argv[index + 1] : join(BENCH, '.cache', 'site');
    const profiles = await buildSite({ out, local: process.argv.includes('--local') });
    console.log(`Built the benchmark page in ${out} (${profiles.length ? profiles.join(', ') : 'no results yet'})`);
}
