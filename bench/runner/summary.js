/**
 * Turns samples into the per-metric summaries stored with the results.
 */
import { pick, summarize, tally } from './stats.js';

export const LOAD_METRICS = [
    'ttfb', 'server', 'fcp', 'lcp', 'cls', 'tbt', 'settled', 'longTasks',
    'mainThread.task', 'mainThread.script', 'requests',
    'bytes.total.transfer', 'bytes.document.transfer', 'bytes.script.transfer', 'bytes.script.decoded', 'bytes.image.transfer',
];
export const REPEAT_METRICS = [
    'fcp', 'lcp', 'tbt', 'settled', 'bytes.total.transfer', 'bytes.script.transfer', 'requests',
    'memory.heap', 'memory.nodes', 'memory.listeners',
];
export const JOURNEY_METRICS = ['effect', 'inp', 'requests', 'bytes.transfer', 'bytes.script'];

const over = (list, metrics, seed) => Object.fromEntries(metrics.map((metric) => [metric, summarize(list.map((sample) => pick(sample, metric)), { seed })]));

/**
 * @param {{ cold: object[], repeat: object[], journeys: Record<string, object[]>, early: object[] }} samples
 */
export function summarizeSamples(samples, seed = 1) {
    return {
        cold: over(samples.cold, LOAD_METRICS, seed),
        repeat: over(samples.repeat, REPEAT_METRICS, seed),
        journeys: Object.fromEntries(Object.entries(samples.journeys).map(([id, list]) => [id, {
            ...over(list, JOURNEY_METRICS, seed),
            navigated: tally(list.map((sample) => String(sample.navigated))),
            failed: list.filter((sample) => sample.effect === null).length,
        }])),
        early: {
            outcomes: tally(samples.early.map((sample) => sample.outcome)),
            effect: summarize(samples.early.map((sample) => sample.effect), { seed }),
            sinceFcp: summarize(samples.early.map((sample) => sample.sinceFcp), { seed }),
        },
    };
}
