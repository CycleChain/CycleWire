import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { summarize } from '../../runner/stats.js';
import { LIBRARIES as MORPH_LIBRARIES } from '../morph/adapters.js';
import { CASES } from '../morph/cases.js';
import { OPERATIONS } from '../morph/rows.js';
import { LIBRARIES as SIGNAL_LIBRARIES } from '../signals/adapters.js';
import { SCENARIOS } from '../signals/scenarios.js';
import { validate } from '../validate.js';

/** A small result, shaped as run.js writes one. */
function sample() {
    const times = [3.2, 3.1, 3.4];
    return {
        schema: 'cyclewire-bench/micro@1',
        id: '2026-09-26T10-00-00Z-micro',
        startedAt: '2026-09-26T10:00:00.000Z',
        finishedAt: '2026-09-26T10:05:00.000Z',
        environment: {
            runner: 'local',
            os: 'Linux 6.8',
            arch: 'x64',
            cpu: 'A CPU',
            cores: 4,
            memoryGB: 16,
            loadAverage: [0.5, 0.4, 0.3],
            loadAverageEnd: [0.6, 0.4, 0.3],
            node: 'v24.0.0',
            playwright: '1.63.0',
            commit: '89761f1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            nodeCpuIndex: 12000,
        },
        config: { suites: ['signals', 'morph'], samples: 3, warmup: 1, seed: 1, browsers: ['chromium'], channel: null },
        signals: {
            libraries: SIGNAL_LIBRARIES.map(({ id, name, package: pkg, module, batching, api, note }) => ({ id, name, package: pkg, version: '1.0.0', module, batching, api, ...(note ? { note } : {}) })),
            scenarios: SCENARIOS.slice(0, 2).map(({ id, group, title, measures, checks }) => ({ id, group, title, measures, checks })),
            results: [
                { library: 'cyclewire', scenario: 'kairo/avoidable', status: 'ok', samples: times, summary: summarize(times), counts: { evaluations: 5005 } },
                { library: 'vue', scenario: 'kairo/broad', status: 'failed', message: 'CheckFailure: effects ran 2 times, not 2,500', samples: [], summary: null },
            ],
        },
        morph: {
            libraries: MORPH_LIBRARIES.map(({ id, name, package: pkg, call, options, defaults }) => ({ id, name, package: pkg, version: '1.0.0', call, options, defaults })),
            browsers: [{ name: 'chromium', channel: 'chromium', version: '153.0.0.0', crossOriginIsolated: true, timerResolutionMs: 0.005, moveBefore: true, gc: true, userAgent: 'HeadlessChrome' }],
            cases: CASES.map(({ id, title, want, why, design }) => ({ id, title, want, why, ...(design ? { design } : {}) })),
            operations: OPERATIONS.map(({ id, title, from }) => ({ id, title, rows: from ? from.length : 0 })),
            correctness: [
                { browser: 'chromium', library: 'cyclewire', case: 'markup', pass: true, problems: [] },
                { browser: 'chromium', library: 'morphdom', case: 'template', pass: false, problems: ['the markup differs'] },
            ],
            speed: [
                {
                    browser: 'chromium',
                    library: 'idiomorph',
                    operation: 'reverse',
                    status: 'ok',
                    samples: times,
                    withLayout: times,
                    summary: summarize(times),
                    summaryWithLayout: summarize(times),
                    mutations: { records: 10, childList: 10, attributes: 0, characterData: 0, added: 5, removed: 5 },
                    kept: 1000,
                    expectedKept: 1000,
                },
                { browser: 'chromium', library: 'morphdom', operation: 'reverse', status: 'failed', message: 'the markup differs', samples: [], withLayout: [], summary: null, summaryWithLayout: null, mutations: null, kept: null, expectedKept: null },
            ],
        },
        failures: [{ suite: 'morph', browser: 'webkit', message: 'could not launch webkit' }],
    };
}

test('a result validates against schema/micro.v1.json', () => {
    assert.deepEqual(validate(sample()), []);
    assert.deepEqual(validate({ ...sample(), signals: null }), []);
    assert.deepEqual(validate({ ...sample(), morph: null }), []);
});

test('the schema refuses results that are not whole', () => {
    const wrongStatus = sample();
    wrongStatus.signals.results[0].status = 'slow';
    assert.ok(validate(wrongStatus).some((problem) => problem.includes('/signals/results/0/status')));
    const noSummary = sample();
    delete (/** @type {any} */ (noSummary.morph.speed[0]).summary);
    assert.ok(validate(noSummary).length);
    const extra = { ...sample(), score: 100 };
    assert.ok(validate(extra).some((problem) => problem.includes('additional properties')));
    const wrongSchema = { ...sample(), schema: 'cyclewire-bench/results@1' };
    assert.ok(validate(wrongSchema).length);
});

test('report.js prints every section as Markdown tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'micro-'));
    try {
        const file = join(dir, 'result.json');
        writeFileSync(file, JSON.stringify(sample()));
        const output = execFileSync(process.execPath, [fileURLToPath(new URL('../report.js', import.meta.url)), file], { encoding: 'utf8' });
        assert.match(output, /### Signals/);
        assert.match(output, /\| Avoidable propagation \| 3\.20 \(/);
        assert.match(output, /\*\*failed\*\*/);
        assert.match(output, /kairo\/broad, vue: CheckFailure/);
        assert.match(output, /### Morph: correctness/);
        assert.match(output, /### Morph: speed in Chromium 153\.0\.0\.0/);
        assert.match(output, /10, 1,000\/1,000 kept/);
        assert.match(output, /could not launch webkit/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
