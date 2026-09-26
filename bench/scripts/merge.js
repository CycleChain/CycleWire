#!/usr/bin/env node
/**
 * Merges runs of one profile that measured different kinds of visits into one
 * results file, so that a full run can be split across machines without
 * mixing machines within a metric: the Benchmark workflow measures the
 * journeys (and the loads they start with) on one runner, and the early taps
 * and repeat visits on another, every stack on both.
 *
 *   node scripts/merge.js --out-dir=results part-journeys.json part-taps.json
 *
 * The merged file is named <date>-<profile>.json after the earliest part. Its
 * `environment` is the first part's; `parts` records each part's kinds, times
 * and machine. Summaries are computed again from the merged samples.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { summarizeSamples } from '../runner/summary.js';
import { validate } from '../runner/validate.js';

const KINDS = ['journeys', 'early', 'repeat'];

const union = (lists, order) => {
    const all = new Set(lists.flat());
    return order ? order.filter((item) => all.has(item)) : [...all];
};

/**
 * @param {any[]} parts results of the same profile and seed
 * @returns {any} the merged results
 */
export function merge(parts) {
    if (!parts.length) throw new Error('Nothing to merge');
    const [first] = parts;
    for (const part of parts) {
        if (part.schema !== first.schema) throw new Error(`Cannot merge ${part.schema} with ${first.schema}`);
        if (part.profile.id !== first.profile.id) throw new Error(`Cannot merge the ${part.profile.id} profile with ${first.profile.id}`);
        if (part.config.seed !== first.config.seed) throw new Error('The parts were run with different seeds');
    }
    const kinds = parts.map((part) => part.config.kinds);
    for (const [i, own] of kinds.entries()) {
        for (const other of kinds.slice(i + 1)) {
            const shared = own.filter((kind) => other.includes(kind));
            if (shared.length) throw new Error(`Two parts measured ${shared.join(', ')}: merge parts that measured different kinds`);
        }
    }
    const byTime = [...parts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const startedAt = byTime[0].startedAt;
    const finishedAt = parts.map((part) => part.finishedAt).sort().at(-1);

    /** @type {Map<string, any>} */
    const stacks = new Map();
    for (const part of parts) {
        for (const stack of part.stacks) {
            const found = stacks.get(stack.id);
            if (!found) {
                const { samples, summaries, ...rest } = stack;
                stacks.set(stack.id, { ...rest, samples: null, summaries: null, measured: false });
            } else if (!stack.conformance.passed && found.conformance.passed) {
                // A check that failed on any machine is the one to show.
                found.conformance = stack.conformance;
            }
            const into = stacks.get(stack.id);
            if (!stack.measured || !stack.samples) continue;
            into.measured = true;
            into.samples ??= { cold: [], repeat: [], journeys: {}, early: [] };
            into.samples.cold.push(...stack.samples.cold);
            into.samples.repeat.push(...stack.samples.repeat);
            into.samples.early.push(...stack.samples.early);
            for (const [journey, list] of Object.entries(stack.samples.journeys)) (into.samples.journeys[journey] ??= []).push(...list);
        }
    }
    for (const stack of stacks.values()) stack.summaries = stack.samples ? summarizeSamples(stack.samples, first.config.seed) : null;

    const offsets = union(parts.map((part) => part.config.offsets ?? [])).sort((a, b) => a - b);
    return {
        schema: first.schema,
        id: `${startedAt.slice(0, 19).replace(/:/g, '-')}Z-${first.profile.id}`,
        startedAt,
        finishedAt,
        profile: first.profile,
        environment: first.environment,
        parts: parts.map((part) => ({ kinds: part.config.kinds, startedAt: part.startedAt, finishedAt: part.finishedAt, environment: part.environment })),
        config: {
            iterations: Math.min(...parts.map((part) => part.config.iterations)),
            planned: Math.max(...parts.map((part) => part.config.planned ?? part.config.iterations)),
            seed: first.config.seed,
            kinds: union(kinds, KINDS),
            journeys: union(parts.filter((part) => part.config.kinds.includes('journeys')).map((part) => part.config.journeys)),
            ...(offsets.length ? { offsets } : {}),
            quietMs: first.config.quietMs,
            delivery: first.config.delivery,
        },
        stacks: [...stacks.values()],
        failures: parts.flatMap((part) => part.failures),
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const { values, positionals } = parseArgs({ options: { 'out-dir': { type: 'string', default: 'results' } }, allowPositionals: true });
    if (!positionals.length) {
        console.error('Usage: node scripts/merge.js [--out-dir=results] <part.json>...');
        process.exit(2);
    }
    const merged = merge(await Promise.all(positionals.map(async (file) => JSON.parse(await readFile(file, 'utf8')))));
    const problems = validate(merged);
    if (problems.length) {
        console.error(`The merged results do not match schema/results.v1.json:\n${problems.join('\n')}`);
        process.exit(1);
    }
    const out = join(values['out-dir'], `${merged.startedAt.slice(0, 10)}-${merged.profile.id}.json`);
    await writeFile(out, `${JSON.stringify(merged)}\n`);
    console.log(`Wrote ${relative(process.cwd(), out)}: ${merged.config.kinds.join(', ')} for ${merged.stacks.filter((stack) => stack.measured).length} stacks`);
}
