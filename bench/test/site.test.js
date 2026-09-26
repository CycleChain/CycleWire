import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { beats, latest, leaders, EFFECTS, notBest, REDIRECT, section } from '../scripts/build-site.js';

const summary = (median, spread = 5) => ({ n: 10, median, p25: median, p75: median, min: median, max: median, ci95: [median - spread, median + spread] });
const summaries = (overrides = {}) => {
    const cold = { fcp: summary(1000), lcp: summary(1200), cls: summary(0, 0), tbt: summary(0, 0), settled: summary(3000), requests: summary(20, 0), 'bytes.script.transfer': summary(9000, 0), 'bytes.total.transfer': summary(380000, 0), 'bytes.document.transfer': summary(2500, 0) };
    const journeys = Object.fromEntries(['cart', 'filter', 'search', 'quickview', 'newsletter'].map((id) => [id, { effect: summary(700), inp: summary(30), navigated: { false: 10 }, failed: 0 }]));
    return {
        cold: { ...cold, ...overrides.cold },
        repeat: { fcp: summary(650), 'bytes.total.transfer': summary(2500, 0), 'memory.heap': summary(1e6, 0), 'memory.listeners': summary(18, 0) },
        journeys: { ...journeys, ...overrides.journeys },
        early: { outcomes: { effect: 10 }, effect: summary(1800), sinceFcp: summary(30), ...overrides.early },
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

test('a stack beats another only with a lower median, intervals apart and a difference of 3% or more', () => {
    assert.ok(beats(summary(900), summary(1000)));
    assert.ok(!beats(summary(1000), summary(900)));
    assert.ok(!beats(summary(990, 10), summary(1000, 10)), 'the intervals overlap');
    assert.ok(!beats(summary(980, 1), summary(1000, 1)), '2% is not a finding');
    assert.ok(!beats(undefined, summary(1000)));
});

test('lists the metrics where a non-control stack clearly beats CycleWire', () => {
    const run = results([
        stack('vanilla', 'control', { cold: { fcp: summary(500) } }),
        stack('cyclewire', 'library'),
        stack('fast', 'framework', { cold: { lcp: summary(900) }, journeys: { filter: { effect: summary(100) } } }),
        stack('close', 'framework', { cold: { settled: summary(2995) } }),
        // Clearly separate, but only 2% lower: not a finding.
        stack('slight', 'framework', { journeys: { cart: { effect: summary(686, 1) } } }),
    ]);
    const found = notBest(run).map(({ metric, best }) => [metric.id, best.stack.id]);
    // The control's faster FCP, the overlapping settle time and the 2% difference are not listed.
    assert.deepEqual(found, [['lcp', 'fast'], ['effect-filter', 'fast']]);
});

test('the early tap counts only for stacks that handled every tap', () => {
    const run = results([
        stack('cyclewire', 'library'),
        stack('reload', 'framework', { early: { outcomes: { navigation: 10 }, effect: summary(900) } }),
        stack('lossy', 'framework', { early: { outcomes: { effect: 7, lost: 3 }, effect: summary(500) } }),
    ]);
    assert.deepEqual(notBest(run).map(({ metric, best }) => [metric.id, best.stack.id]), [['early', 'reload']]);
});

test('bold marks every stack that no other non-control stack beats', () => {
    const stacks = [
        stack('static', 'control', { journeys: { filter: { effect: summary(50) } } }),
        stack('cyclewire', 'library', { journeys: { filter: { effect: summary(600) } } }),
        stack('a', 'framework', { journeys: { filter: { effect: summary(116, 4) } } }),
        // Slower than a, but its wide interval overlaps a's: not clearly beaten.
        stack('b', 'framework', { journeys: { filter: { effect: summary(128, 20) } } }),
    ];
    const filter = EFFECTS.find((metric) => metric.id === 'effect-filter');
    assert.deepEqual([...leaders(stacks, filter)].sort(), ['a', 'b']);
});

test('the section escapes what the results say, and every profile has a panel', () => {
    const html = section({ mobile: { file: 'x.json', results: results([stack('cyclewire', 'library'), stack('evil', 'framework')]) } });
    assert.ok(html.includes('&lt;evil&gt;'));
    assert.ok(!html.includes('<evil>'));
    assert.match(html, /<input type="radio" name="bench-profile" id="bench-mobile" checked>/);
    assert.match(html, /data-for="bench-desktop" data-bench="desktop"><p class="muted">Not measured yet\.<\/p>/);
    assert.match(html, /href="\.\/bench\/results\/x\.json"/);
    assert.match(html, /href="https:\/\/github.com\/CycleChain\/CycleWire\/blob\/main\/bench\/apps\/evil\/bench.json"/);
});

test('the chart starts on JavaScript, lowest first, and every metric it offers is a column of the table', () => {
    const html = section({ mobile: { file: 'x.json', results: results([stack('cyclewire', 'library'), stack('light', 'framework', { cold: { 'bytes.script.transfer': summary(3000, 0) } })]) } });
    const bars = [...html.matchAll(/<li class="bench__bar[^"]*" data-stack="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(bars, ['light', 'cyclewire']);
    const panel = html.slice(html.indexOf('data-bench="mobile"'));
    const metrics = [...panel.matchAll(/cw-action="bench" data-metric="([^"]+)"/g)].map((match) => match[1]);
    for (const metric of metrics) assert.match(panel, new RegExp(`<th scope="col" data-metric="${metric}" data-column="\\d+"`), metric);
    // The chart's button for JavaScript is pressed, and the table's JavaScript column is the first after the stack.
    assert.match(panel, /data-metric="js" aria-pressed="true"/);
    assert.match(panel, /data-metric="js" data-column="1"/);
    assert.match(panel, /data-metric="early" data-column="9"[^>]* rowspan="2"/);
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

test('the old results page sends visitors to the section', async () => {
    assert.match(REDIRECT, /<meta http-equiv="refresh" content="0; url=\.\.\/#benchmark">/);
    const landing = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8');
    assert.match(landing, /<section class="section" id="benchmark"/);
});
