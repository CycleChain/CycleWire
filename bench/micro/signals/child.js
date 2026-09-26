/**
 * Runs signal scenarios for one library, in a process of its own, so that
 * what the JIT learned from one library never helps or hurts another. The
 * parent (signals/run.js) starts it with --expose-gc and NODE_ENV=production.
 *
 *   node --expose-gc signals/child.js --library=cyclewire --scenario=kairo/deep --samples=15 --warmup=3
 *
 * It sends one message per scenario to the parent (or prints JSON lines when
 * run on its own). A garbage collection runs before every sample.
 */
import { parseArgs } from 'node:util';
import { library } from './adapters.js';
import { scenario } from './scenarios.js';

const { values: args } = parseArgs({
    options: {
        library: { type: 'string' },
        scenario: { type: 'string', multiple: true },
        samples: { type: 'string', default: '15' },
        warmup: { type: 'string', default: '3' },
    },
});

/** @param {object} message */
const send = (message) => (process.send ? process.send(message) : console.log(JSON.stringify(message)));

const lib = library(args.library ?? '');
if (!lib) {
    send({ type: 'fatal', message: `Unknown library "${args.library}"` });
    process.exit(2);
}
const samples = Number(args.samples);
const warmup = Number(args.warmup);
const gc = /** @type {() => void} */ (globalThis.gc ?? (() => {}));
const fw = await lib.load();

for (const id of args.scenario ?? []) {
    const entry = scenario(id);
    if (!entry) {
        send({ type: 'result', scenario: id, status: 'failed', message: `Unknown scenario "${id}"` });
        continue;
    }
    send({ type: 'start', scenario: id });
    try {
        const runner = entry.setup(fw, lib);
        /** @type {number[]} */
        const times = [];
        /** @type {Record<string, number> | undefined} */
        let counts;
        try {
            for (let i = 0; i < warmup + samples; i++) {
                gc();
                const { ms, counts: sampleCounts } = runner.sample(gc);
                if (i < warmup) continue;
                times.push(ms);
                counts ??= sampleCounts;
            }
        } finally {
            runner.done?.();
        }
        send({ type: 'result', scenario: id, status: 'ok', samples: times, counts });
    } catch (error) {
        const failure = /** @type {Error} */ (error);
        send({ type: 'result', scenario: id, status: 'failed', message: `${failure?.name ?? 'Error'}: ${failure?.message ?? failure}` });
        // A throw from inside a library can leave its internal state (batch
        // depth, the running observer) half-updated: stop here, and let the
        // parent start a fresh process for anything left.
        break;
    }
}
process.disconnect?.();
