import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { latest, notBest, page } from '../scripts/build-site.js';

const summary = (median, spread = 5) => ({ n: 10, median, p25: median, p75: median, min: median, max: median, ci95: [median - spread, median + spread] });
const summaries = (overrides = {}) => {
    const cold = { fcp: summary(1000), lcp: summary(1200), cls: summary(0, 0), tbt: summary(0, 0), settled: summary(3000), requests: summary(20, 0), 'bytes.script.transfer': summary(9000, 0), 'bytes.total.transfer': summary(380000, 0), 'bytes.document.transfer': summary(2500, 0) };
    const journeys = Object.fromEntries(['cart', 'filter', 'search', 'quickview', 'newsletter'].map((id) => [id, { effect: summary(700), inp: summary(30), navigated: { false: 10 }, failed: 0 }]));
    return {
        cold: { ...cold, ...overrides.cold },
        repeat: { fcp: summary(650), 'bytes.total.transfer': summary(2500, 0), 'memory.heap': summary(1e6, 0), 'memory.listeners': summary(18, 0) },
        journeys: { ...journeys, ...overrides.journeys },
        early: { outcomes: { effect: 10 }, effect: summary(1800), sinceFcp: summary(30) },
    };
};
const stack = (id, kind, overrides) => ({
    id, name: id === 'cyclewire' ? 'CycleWire' : `<${id}>`, kind, summary: 'A stack.', versions: {}, search: 'live', idioms: [{ choice: 'A choice', docs: 'https://example.com/docs' }],
    conformance: { passed: true, checks: [{ id: 'http2', passed: true, detail: '' }] }, measured: true, samples: null, summaries: summaries(overrides),
});
const results = (stacks, startedAt = '2026-09-25T10:00:00.000Z', profile = 'mobile') => ({
    schema: 'cyclewire-bench/results@1', id: 'x', startedAt, finishedAt: startedAt,
    profile: { id: profile, label: 'Mobile: slow 4G', cpuSlowdown: 4, network: {}, viewport: {}, deviceScaleFactor: 1, input: {} },
    environment: { runner: 'github-hosted', os: 'Linux', arch: 'x64', cpu: 'CPU', cores: 4, memoryGB: 16, loadAverage: [1, 1, 1], node: 'v24', browser: 'Chrome 141', playwright: '1.63.0', commit: 'abcdef1234', cpuIndex: 1000 },
    config: { iterations: 10, seed: 1, kinds: ['journeys'], journeys: ['cart'], quietMs: 1000, delivery: {} },
    stacks, failures: [],
});

test('lists the metrics where a non-control stack clearly beats CycleWire', () => {
    const run = results([
        stack('vanilla', 'control', { cold: { fcp: summary(500) } }),
        stack('cyclewire', 'library'),
        stack('fast', 'framework', { cold: { lcp: summary(900) }, journeys: { filter: { effect: summary(100) } } }),
        stack('close', 'framework', { cold: { settled: summary(2995) } }),
    ]);
    const found = notBest(run).map(({ metric, best }) => [metric.id, best.stack.id]);
    // The control's faster FCP and the overlapping settle time are not listed.
    assert.deepEqual(found, [['lcp', 'fast'], ['effect-filter', 'fast']]);
});

test('the page escapes what the results say and reads without scripts', () => {
    const html = page({ mobile: { file: 'x.json', results: results([stack('cyclewire', 'library'), stack('evil', 'framework')]) } });
    assert.ok(html.includes('&lt;evil&gt;'));
    assert.ok(!html.includes('<evil>'));
    assert.match(html, /<caption id="mobile-load-caption">/);
    assert.match(html, /Not measured yet/); // desktop
    assert.match(html, /href="https:\/\/example.com\/docs"/);
});

test('picks the newest published run of each profile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bench-site-'));
    await writeFile(join(dir, 'old.json'), JSON.stringify(results([], '2026-09-01T00:00:00.000Z')));
    await writeFile(join(dir, 'new.json'), JSON.stringify(results([], '2026-09-20T00:00:00.000Z')));
    await writeFile(join(dir, 'mine.local.json'), JSON.stringify(results([], '2026-09-30T00:00:00.000Z')));
    await writeFile(join(dir, 'desk.json'), JSON.stringify(results([], '2026-09-02T00:00:00.000Z', 'desktop')));
    const found = await latest(dir);
    assert.equal(found.mobile.file, 'new.json');
    assert.equal(found.desktop.file, 'desk.json');
    assert.equal((await latest(dir, { local: true })).mobile.file, 'mine.local.json');
});
