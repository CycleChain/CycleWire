/**
 * Turns samples into the per-metric summaries stored with the results.
 */
import { pick, summarize, tally } from './stats.js';

export const LOAD_METRICS = [
    'ttfb', 'server', 'fcp', 'lcp', 'cls', 'tbt', 'settled', 'longTasks',
    'mainThread.task', 'mainThread.script', 'mainThread.style', 'mainThread.layout', 'requests',
    'bytes.total.transfer', 'bytes.document.transfer', 'bytes.script.transfer', 'bytes.script.decoded', 'bytes.image.transfer',
];
export const REPEAT_METRICS = [
    'fcp', 'lcp', 'tbt', 'settled', 'bytes.total.transfer', 'bytes.script.transfer', 'requests',
    'memory.heap', 'memory.nodes', 'memory.listeners',
];
export const JOURNEY_METRICS = ['effect', 'inp', 'requests', 'bytes.transfer', 'bytes.script'];

const over = (list, metrics, seed) => Object.fromEntries(metrics.map((metric) => [metric, summarize(list.map((sample) => pick(sample, metric)), { seed })]));

/** How a set of early taps went. */
const taps = (list, seed) => ({
    outcomes: tally(list.map((sample) => sample.outcome)),
    effect: summarize(list.map((sample) => sample.effect), { seed }),
    sinceFcp: summarize(list.map((sample) => sample.sinceFcp), { seed }),
});

/**
 * `early` summarizes the taps in the first frame after first paint, `later`
 * the taps that waited, by how many ms. A sample without an offset is from a
 * run that only tapped at once.
 * @param {{ cold: object[], repeat: object[], journeys: Record<string, object[]>, early: object[] }} samples
 */
export function summarizeSamples(samples, seed = 1) {
    const offsets = [...new Set(samples.early.map((sample) => sample.offset ?? 0))].filter(Boolean).sort((a, b) => a - b);
    return {
        cold: over(samples.cold, LOAD_METRICS, seed),
        repeat: over(samples.repeat, REPEAT_METRICS, seed),
        journeys: Object.fromEntries(Object.entries(samples.journeys).map(([id, list]) => [id, {
            ...over(list, JOURNEY_METRICS, seed),
            navigated: tally(list.map((sample) => String(sample.navigated))),
            failed: list.filter((sample) => sample.effect === null).length,
        }])),
        early: taps(samples.early.filter((sample) => !sample.offset), seed),
        later: Object.fromEntries(offsets.map((offset) => [offset, taps(samples.early.filter((sample) => sample.offset === offset), seed)])),
    };
}
