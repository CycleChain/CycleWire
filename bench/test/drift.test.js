import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drift } from '../scripts/drift.js';

const summary = (median, spread = 5) => ({ n: 10, median, p25: median, p75: median, min: median, max: median, ci95: [median - spread, median + spread] });
const run = (startedAt, browser, stacks) => ({
    startedAt,
    profile: { id: 'mobile' },
    environment: { browser, cpu: 'CPU', cpuIndex: 1000 },
    config: { offsets: [0] },
    stacks: stacks.map(([id, lcp, version]) => ({ id, name: id, measured: true, versions: { [id]: version }, summaries: { cold: { lcp: summary(lcp) }, repeat: {}, journeys: {}, early: {} } })),
});

test('drift lists what clearly changed since the published run, and the machine', () => {
    const before = run('2026-09-20T00:00:00Z', 'Chrome 150', [['a', 1000, '1.0.0'], ['b', 1000, '2.0.0'], ['old', 900, '1.0.0']]);
    const after = run('2026-09-27T00:00:00Z', 'Chrome 151', [['a', 800, '1.1.0'], ['b', 1001, '2.0.0'], ['new', 700, '1.0.0']]);
    const text = drift(before, after);
    assert.match(text, /The machine changed: browser Chrome 150 → Chrome 151/);
    assert.match(text, /\| a \(a 1\.0\.0 → 1\.1\.0\) \| Largest Contentful Paint 1,000 ms → 800 ms \| – \|/);
    // 1 ms in 1000 is not a change.
    assert.doesNotMatch(text, /\| b /);
    assert.match(text, /\| new \| new in this run \|/);
    assert.match(text, /Not measured this time: old\./);
});
