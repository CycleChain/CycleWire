import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameText } from '../runner/conformance.js';
import { blockingTime } from '../runner/measure.js';
import { bytes } from '../runner/network.js';
import { PROFILES, contextOptions, describe, networkConditions } from '../runner/profiles.js';
import { quantile, summarize, tally } from '../runner/stats.js';
import { summarizeSamples } from '../runner/summary.js';

test('quantiles interpolate between order statistics', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    assert.equal(quantile(sorted, 0.5), 5);
    assert.equal(quantile(sorted, 0.25), 3);
    assert.equal(quantile([1, 2], 0.5), 1.5);
    assert.equal(quantile([], 0.5), null);
});

test('summaries ignore missing values and bracket the median', () => {
    const summary = summarize([5, null, 1, 9, 3, 7, Number.NaN, 2, 8, 4, 6]);
    assert.equal(summary.n, 9);
    assert.equal(summary.median, 5);
    assert.deepEqual([summary.min, summary.max], [1, 9]);
    assert.ok(summary.ci95[0] <= summary.median && summary.median <= summary.ci95[1]);
    assert.deepEqual(summarize([3, 1, 2], { seed: 7 }), summarize([3, 1, 2], { seed: 7 }));
    assert.equal(summarize([]).n, 0);
    assert.deepEqual(tally(['a', 'b', 'a']), { a: 2, b: 1 });
});

test('blocking time counts what exceeds 50 ms inside the window, as Lighthouse does', () => {
    assert.equal(blockingTime([[0, 120]], 0, 1000), 70);
    assert.equal(blockingTime([[0, 40], [100, 60]], 0, 1000), 10);
    // A task that started before the window only counts its part inside it.
    assert.equal(blockingTime([[0, 200]], 100, 1000), 50);
    // Clipped below 50 ms inside the window: nothing.
    assert.equal(blockingTime([[0, 200]], 160, 1000), 0);
});

test('visible text compares without whitespace and says where it differs', () => {
    assert.equal(sameText('Cart ( 0 )', 'Cart (0)'), null);
    assert.match(sameText('Cart 1', 'Cart 0') ?? '', /differs at character 4/);
});

test('bytes are grouped by resource type, failed requests left out', () => {
    const request = (type, transfer, failed = false) => ({ type, transfer, decoded: transfer * 3, failed });
    const out = bytes([request('Document', 10), request('Script', 20), request('Script', 5), request('Fetch', 1), request('Image', 7, true), request('Manifest', 2)]);
    assert.deepEqual(out.total, { transfer: 38, decoded: 114, count: 5 });
    assert.deepEqual(out.script, { transfer: 25, decoded: 75, count: 2 });
    assert.equal(out.data.count, 1);
    assert.equal(out.other.count, 1);
    assert.equal(out.image.count, 0);
});

test('profiles use Lighthouse throttling numbers', () => {
    assert.deepEqual(networkConditions(PROFILES.mobile), { offline: false, latency: 562.5, downloadThroughput: 188743, uploadThroughput: 86400 });
    assert.equal(contextOptions(PROFILES.mobile, '141.0.7390.54').userAgent.includes('Chrome/141.0.0.0 Mobile'), true);
    assert.equal(contextOptions(PROFILES.desktop, '141.0').userAgent, undefined);
    assert.equal(describe(PROFILES.desktop).network.requestLatencyMs, 150);
});

test('sample summaries cover every metric and count outcomes', () => {
    const load = { ttfb: 570, server: 10, fcp: 100, lcp: 120, cls: 0, tbt: 0, settled: 900, longTasks: 0, mainThread: { task: 50, script: 10 }, requests: 4, bytes: { total: { transfer: 1 }, document: { transfer: 1 }, script: { transfer: 0, decoded: 0 }, image: { transfer: 0 } } };
    const summary = summarizeSamples({
        cold: [load, load],
        repeat: [{ ...load, memory: { heap: 1000, nodes: 2, listeners: 3 } }],
        journeys: { cart: [{ effect: 50, inp: 20, requests: 1, bytes: { transfer: 10, script: 0 }, navigated: false }, { effect: null, inp: null, requests: 0, bytes: { transfer: 0, script: 0 }, navigated: null }] },
        early: [{ outcome: 'effect', effect: 80, sinceFcp: 5 }, { outcome: 'lost', effect: null, sinceFcp: 4 }],
    });
    assert.equal(summary.cold.fcp.median, 100);
    assert.equal(summary.cold.server.median, 10);
    assert.equal(summary.repeat['memory.listeners'].median, 3);
    assert.equal(summary.journeys.cart.effect.n, 1);
    assert.equal(summary.journeys.cart.failed, 1);
    assert.deepEqual(summary.journeys.cart.navigated, { false: 1, null: 1 });
    assert.deepEqual(summary.early.outcomes, { effect: 1, lost: 1 });
});
