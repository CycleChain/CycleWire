import assert from 'node:assert/strict';
import { test } from 'node:test';
import { merge } from '../scripts/merge.js';
import { validate } from '../runner/validate.js';

const environment = (cpu) => ({ runner: 'github-hosted', os: 'Linux', arch: 'x64', cpu, cores: 4, memoryGB: 16, loadAverage: [1, 1, 1], node: 'v24', browser: 'Chrome 141', playwright: '1.63.0', commit: 'abc', cpuIndex: 1000 });
const bucket = { transfer: 1, decoded: 1, count: 1 };
const bytes = Object.fromEntries(['total', 'document', 'script', 'css', 'image', 'font', 'data', 'other'].map((kind) => [kind, bucket]));
const load = (fcp) => ({ iteration: 0, visit: 'cart', ttfb: 1, server: 1, fcp, lcp: fcp, cls: 0, tbt: 0, longTasks: 0, settled: 9, quiet: true, mainThread: { task: 1, script: 1, layout: 1, style: 1 }, protocol: 'h2', requests: 1, bytes });
const stack = (id, samples, passed = true) => ({
    id, name: id, kind: 'library', summary: 'A stack.', versions: {}, search: 'live', idioms: [],
    conformance: { passed, checks: [{ id: 'text', passed, detail: '' }] }, measured: passed, samples: passed ? samples : null, summaries: null,
});
const part = (kinds, startedAt, cpu, stacks) => ({
    schema: 'cyclewire-bench/results@1', id: 'x', startedAt, finishedAt: startedAt,
    profile: { id: 'mobile', label: 'Mobile', cpuSlowdown: 4, network: {}, viewport: {}, deviceScaleFactor: 1, input: {} },
    environment: environment(cpu),
    config: { iterations: 2, planned: 2, seed: 1, kinds, journeys: ['cart'], offsets: [0, 1000], quietMs: 1000, delivery: {} },
    stacks, failures: [{ stack: 'a', kind: kinds[0], journey: null, iteration: 0, message: cpu }],
});

test('the parts of a run merge into one, with every sample and both machines', () => {
    const journeys = part(['journeys'], '2026-09-27T03:17:00.000Z', 'first', [
        stack('a', { cold: [load(100), load(120)], repeat: [], journeys: { cart: [{ iteration: 0, effect: 50, navigated: false, inp: 10, requests: 1, bytes: { transfer: 1, script: 0 }, errors: [] }] }, early: [] }),
        stack('b', null, false),
    ]);
    const taps = part(['early', 'repeat'], '2026-09-27T03:16:00.000Z', 'second', [
        stack('a', { cold: [], repeat: [load(90)], journeys: {}, early: [{ iteration: 0, offset: 0, outcome: 'effect', tapAt: 1, sinceFcp: 1, effect: 300 }, { iteration: 0, offset: 1000, outcome: 'effect', tapAt: 1, sinceFcp: 1001, effect: 200 }] }),
        stack('b', { cold: [], repeat: [load(80)], journeys: {}, early: [] }),
    ]);
    const merged = merge([journeys, taps]);
    assert.deepEqual(validate(merged), []);
    // The earliest part names the run; the first part's machine is the run's.
    assert.equal(merged.startedAt, '2026-09-27T03:16:00.000Z');
    assert.equal(merged.environment.cpu, 'first');
    assert.deepEqual(merged.parts.map((item) => [item.kinds, item.environment.cpu]), [[['journeys'], 'first'], [['early', 'repeat'], 'second']]);
    assert.deepEqual(merged.config.kinds, ['journeys', 'early', 'repeat']);
    const a = merged.stacks.find((item) => item.id === 'a');
    assert.equal(a.summaries.cold.fcp.median, 110);
    assert.equal(a.summaries.repeat.fcp.median, 90);
    assert.equal(a.summaries.journeys.cart.effect.median, 50);
    assert.equal(a.summaries.early.effect.median, 300);
    assert.equal(a.summaries.later[1000].effect.median, 200);
    // A stack that failed a check on either machine shows that check.
    const b = merged.stacks.find((item) => item.id === 'b');
    assert.equal(b.conformance.passed, false);
    assert.equal(merged.failures.length, 2);
});

test('parts that measured the same kind are not merged', () => {
    const one = part(['journeys'], '2026-09-27T03:17:00.000Z', 'one', []);
    assert.throws(() => merge([one, one]), /Two parts measured journeys/);
    assert.throws(() => merge([one, { ...one, config: { ...one.config, kinds: ['early'], seed: 2 } }]), /different seeds/);
});
