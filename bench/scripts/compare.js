#!/usr/bin/env node
/**
 * Compares two runs of the same stacks on one machine that slowed the network
 * differently: DevTools throttling per request, the benchmark's method, and
 * netem per packet (runner/netem.js). Per metric it prints both medians for
 * every stack, how closely the two runs rank the stacks (Spearman's rho), and
 * whether the stacks that beat CycleWire are the same. The question is whether
 * the method changes the conclusions, not whether the numbers are equal: per
 * packet, TCP's slow start and the TLS handshake cost what they do on a real
 * network, which DevTools only approximates.
 *
 *   node scripts/compare.js <devtools.json> <netem.json>
 */
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { EFFECTS, LOAD, notBest, taps } from './build-site.js';

/** Spearman's rank correlation, with average ranks for ties. */
export function spearman(xs, ys) {
    const ranks = (values) => {
        const order = values.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
        const out = new Array(values.length);
        for (let i = 0; i < order.length;) {
            let j = i;
            while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
            for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
            i = j + 1;
        }
        return out;
    };
    const n = xs.length;
    if (n < 3) return null;
    const rx = ranks(xs);
    const ry = ranks(ys);
    const mean = (n + 1) / 2;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
        num += (rx[i] - mean) * (ry[i] - mean);
        dx += (rx[i] - mean) ** 2;
        dy += (ry[i] - mean) ** 2;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** The comparison as Markdown. */
export function compare(devtools, netem) {
    const metrics = [...LOAD.filter((metric) => ['fcp', 'lcp', 'tbt', 'settled'].includes(metric.id)), ...EFFECTS, ...taps(devtools)];
    const stacks = devtools.stacks.filter((stack) => stack.measured && netem.stacks.find((other) => other.id === stack.id)?.measured);
    const lines = [
        `### DevTools per request and netem per packet, ${devtools.profile.label}`,
        '',
        `Medians, DevTools / netem, from ${devtools.config.iterations} and ${netem.config.iterations} iterations on one machine. ρ is Spearman's rank correlation of the stacks' medians: 1 means both methods order the stacks the same way.`,
        '',
        `| Metric | ρ | ${stacks.map((stack) => stack.name).join(' | ')} |`,
        `| --- | ---: | ${stacks.map(() => '---:').join(' | ')} |`,
    ];
    for (const metric of metrics) {
        const pairs = stacks.map((stack) => [metric.read(stack.summaries)?.median ?? null, metric.read(netem.stacks.find((other) => other.id === stack.id).summaries)?.median ?? null]);
        const both = pairs.filter(([a, b]) => a !== null && b !== null);
        const rho = spearman(both.map(([a]) => a), both.map(([, b]) => b));
        const cell = ([a, b]) => (a === null && b === null ? '–' : `${a === null ? '–' : metric.format(a)} / ${b === null ? '–' : metric.format(b)}`);
        lines.push(`| ${metric.label} | ${rho === null ? '–' : rho.toFixed(2)} | ${pairs.map(cell).join(' | ')} |`);
    }
    const findings = (results) => notBest(results).map(({ metric, best }) => `${metric.label} (${best.stack.name})`).join('; ') || 'none';
    lines.push('', `Where another stack beats CycleWire, DevTools: ${findings(devtools)}.`, '', `Where another stack beats CycleWire, netem: ${findings(netem)}.`, '');
    return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [a, b] = process.argv.slice(2);
    if (!a || !b) {
        console.error('Usage: node scripts/compare.js <devtools.json> <netem.json>');
        process.exit(2);
    }
    const [devtools, netem] = await Promise.all([a, b].map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
    const markdown = compare(devtools, netem);
    console.log(markdown);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
