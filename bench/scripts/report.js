#!/usr/bin/env node
/**
 * Prints a results file as Markdown tables: the median of each metric per
 * stack, with its 95% confidence interval, and how wide that interval is
 * relative to the median (useful to decide how many iterations a run needs).
 *
 *   node scripts/report.js results/2026-09-25-mobile.json
 */
import { readFile } from 'node:fs/promises';

const [file] = process.argv.slice(2);
if (!file) {
    console.error('Usage: node scripts/report.js <results.json>');
    process.exit(2);
}
const results = JSON.parse(await readFile(file, 'utf8'));
const stacks = results.stacks.filter((stack) => stack.measured);

const ms = (value) => (value === null ? '–' : `${Math.round(value)}`);
const kb = (value) => (value === null ? '–' : (value / 1000).toFixed(1));
const cell = (summary, format = ms) => {
    if (!summary || !summary.n) return '–';
    const [low, high] = summary.ci95;
    const spread = summary.median ? Math.round(((high - low) / 2 / Math.abs(summary.median)) * 100) : 0;
    return `${format(summary.median)} (${format(low)}–${format(high)}, ±${spread}%)`;
};

function table(title, rows) {
    console.log(`\n### ${title}\n`);
    console.log(`| Metric | ${stacks.map((stack) => stack.name).join(' | ')} |`);
    console.log(`| --- | ${stacks.map(() => '---').join(' | ')} |`);
    for (const [label, read, format] of rows) console.log(`| ${label} | ${stacks.map((stack) => cell(read(stack.summaries), format)).join(' | ')} |`);
}

const { profile, environment, config } = results;
console.log(`## ${profile.label}\n`);
console.log(`${config.iterations} iterations on ${environment.cpu} (${environment.cores} cores, ${environment.runner}), ${environment.browser}, CPU index ${environment.cpuIndex}, load average ${environment.loadAverage.join(' / ')}.`);
console.log('Cells: median (95% CI, ± half-width as % of the median). Times in ms, sizes in kB.');

table('Load (cold)', [
    ['TTFB', (s) => s.cold.ttfb],
    ['Server response', (s) => s.cold.server],
    ['FCP', (s) => s.cold.fcp],
    ['LCP', (s) => s.cold.lcp],
    ['TBT', (s) => s.cold.tbt],
    ['Settled', (s) => s.cold.settled],
    ['Main thread (task)', (s) => s.cold['mainThread.task']],
    ['Script time', (s) => s.cold['mainThread.script']],
    ['Style time', (s) => s.cold['mainThread.style']],
    ['Layout time', (s) => s.cold['mainThread.layout']],
    ['JavaScript (transfer)', (s) => s.cold['bytes.script.transfer'], kb],
    ['Document (transfer)', (s) => s.cold['bytes.document.transfer'], kb],
    ['Total (transfer)', (s) => s.cold['bytes.total.transfer'], kb],
    ['Requests', (s) => s.cold.requests],
]);
table('Time to effect', (results.config.journeys ?? []).map((id) => [id, (s) => s.journeys[id]?.effect]));
table('Largest Event Timing duration', (results.config.journeys ?? []).map((id) => [id, (s) => s.journeys[id]?.inp]));
table('Repeat visit', [
    ['FCP', (s) => s.repeat.fcp],
    ['LCP', (s) => s.repeat.lcp],
    ['Total (transfer)', (s) => s.repeat['bytes.total.transfer'], kb],
    ['JS heap after load', (s) => s.repeat['memory.heap'], kb],
    ['DOM nodes', (s) => s.repeat['memory.nodes']],
    ['Event listeners', (s) => s.repeat['memory.listeners']],
]);

console.log('\n### Early tap\n');
console.log('| Stack | Waited | Outcomes | Time to effect | Tap after FCP |');
console.log('| --- | --- | --- | --- | --- |');
for (const stack of stacks) {
    const taps = [['0 ms', stack.summaries.early], ...Object.entries(stack.summaries.later ?? {}).map(([offset, summary]) => [`${offset} ms`, summary])];
    for (const [waited, { outcomes, effect, sinceFcp }] of taps) {
        console.log(`| ${stack.name} | ${waited} | ${Object.entries(outcomes).map(([outcome, count]) => `${outcome} ${count}`).join(', ') || '–'} | ${cell(effect)} | ${cell(sinceFcp)} |`);
    }
}
if (results.failures.length) {
    console.log(`\n${results.failures.length} visits failed:`);
    for (const failure of results.failures.slice(0, 10)) console.log(`- ${failure.stack} ${failure.kind}${failure.journey ? ` ${failure.journey}` : ''} #${failure.iteration}: ${failure.message.split('\n')[0]}`);
}
