#!/usr/bin/env node
/**
 * What changed since the published run of the same profile: for every stack
 * in both, the metrics that are clearly faster or slower now (the rule the
 * website uses between stacks: 95% intervals apart and a difference of at
 * least 3%), and what changed about the machine and the browser. The weekly
 * run prints it into its summary, so drift in the runners or in Chrome shows
 * up before anyone reads it as a change in a stack.
 *
 *   node scripts/drift.js <new.json> [--against=results]
 */
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { EFFECTS, LOAD, REPEAT, beats, latest, taps } from './build-site.js';

const BENCH = fileURLToPath(new URL('..', import.meta.url));

/** The changes between two runs of one profile, as Markdown. */
export function drift(before, after) {
    const lines = [`### Since the published ${after.profile.id} run of ${before.startedAt.slice(0, 10)}`, ''];
    const machine = [];
    const was = before.environment;
    const is = after.environment;
    if (was.browser !== is.browser) machine.push(`browser ${was.browser} → ${is.browser}`);
    if (was.cpu !== is.cpu) machine.push(`CPU ${was.cpu} → ${is.cpu}`);
    if (was.cpuIndex && is.cpuIndex) {
        const change = (is.cpuIndex - was.cpuIndex) / was.cpuIndex;
        if (Math.abs(change) >= 0.05) machine.push(`CPU index ${Math.round(change * 100)}% (${was.cpuIndex} → ${is.cpuIndex})`);
    }
    lines.push(machine.length ? `The machine changed: ${machine.join('; ')}. Read the changes below with that in mind.` : 'Same browser and CPU.', '');

    const metrics = [...LOAD, ...EFFECTS, ...taps(after), ...REPEAT];
    const rows = [];
    for (const stack of after.stacks.filter((item) => item.measured)) {
        const old = before.stacks.find((item) => item.id === stack.id && item.measured);
        if (!old) {
            rows.push(`| ${stack.name} | new in this run | |`);
            continue;
        }
        const faster = [];
        const slower = [];
        for (const metric of metrics) {
            const now = metric.read(stack.summaries);
            const then = metric.read(old.summaries);
            const say = () => `${metric.label} ${metric.format(then.median)} → ${metric.format(now.median)}`;
            if (beats(now, then)) faster.push(say());
            else if (beats(then, now)) slower.push(say());
        }
        const versions = Object.entries(stack.versions ?? {}).filter(([name, version]) => old.versions?.[name] !== version).map(([name, version]) => `${name} ${old.versions?.[name] ?? '–'} → ${version}`);
        if (faster.length || slower.length || versions.length) rows.push(`| ${stack.name}${versions.length ? ` (${versions.join(', ')})` : ''} | ${faster.join('; ') || '–'} | ${slower.join('; ') || '–'} |`);
    }
    const gone = before.stacks.filter((stack) => stack.measured && !after.stacks.some((item) => item.id === stack.id && item.measured)).map((stack) => stack.name);
    if (rows.length) lines.push('| Stack | Clearly faster | Clearly slower |', '| --- | --- | --- |', ...rows, '');
    else lines.push('No metric of any stack changed clearly.', '');
    if (gone.length) lines.push(`Not measured this time: ${gone.join(', ')}.`, '');
    return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const { values, positionals } = parseArgs({ options: { against: { type: 'string', default: join(BENCH, 'results') } }, allowPositionals: true });
    if (!positionals.length) {
        console.error('Usage: node scripts/drift.js <new.json>... [--against=results]');
        process.exit(2);
    }
    const published = await latest(values.against);
    for (const file of positionals) {
        const after = JSON.parse(await readFile(file, 'utf8'));
        const before = published[after.profile.id]?.results;
        const markdown = before ? drift(before, after) : `### ${after.profile.id}\n\nNothing published to compare with.\n`;
        console.log(markdown);
        if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    }
}
