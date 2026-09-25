/**
 * Summaries of repeated measurements: the median with a bootstrap 95%
 * confidence interval, quartiles, and the range. No single composite score
 * is ever computed.
 */
import { prng } from '../scenario/random.js';

/** Linear interpolation between order statistics (R's type 7). */
export function quantile(sorted, p) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

const round = (value) => (value === null ? null : Math.round(value * 100) / 100);

/**
 * @param {Array<number | null | undefined>} values
 * @param {{ seed?: number, resamples?: number }} [options]
 */
export function summarize(values, { seed = 1, resamples = 2000 } = {}) {
    const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    const n = clean.length;
    if (!n) return { n: 0, median: null, p25: null, p75: null, min: null, max: null, ci95: null };
    const random = prng(seed);
    const medians = new Float64Array(resamples);
    const sample = new Float64Array(n);
    for (let r = 0; r < resamples; r++) {
        for (let i = 0; i < n; i++) sample[i] = clean[Math.floor(random() * n)];
        sample.sort();
        medians[r] = quantile(sample, 0.5);
    }
    medians.sort();
    return {
        n,
        median: round(quantile(clean, 0.5)),
        p25: round(quantile(clean, 0.25)),
        p75: round(quantile(clean, 0.75)),
        min: round(clean[0]),
        max: round(clean[n - 1]),
        ci95: [round(quantile(medians, 0.025)), round(quantile(medians, 0.975))],
    };
}

/** Reads a dotted path such as "bytes.script.transfer". */
export const pick = (object, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);

/** Counts of each value, e.g. early-tap outcomes. */
export function tally(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
}
