import assert from 'node:assert/strict';
import { test } from 'node:test';

// As in the benchmark's child processes: @vue/reactivity's production build.
process.env.NODE_ENV ??= 'production';
const { LIBRARIES } = await import('../signals/adapters.js');
const { CheckFailure, SCENARIOS, cellxExpected, dynamicGraph, planGraph, scenario } = await import('../signals/scenarios.js');

/** @typedef {import('../signals/adapters.js').Adapter} Adapter */

/** A tiny graph: two signals, two computeds, one effect. What it logs, step by step. @param {Adapter} fw */
function tiny(fw) {
    /** @type {number[]} */
    const log = [];
    const graph = fw.withBuild(() => {
        const a = fw.signal(1);
        const b = fw.signal(2);
        const sum = fw.computed(() => a.read() + b.read());
        const double = fw.computed(() => sum.read() * 2);
        fw.effect(() => void log.push(double.read()));
        return { a, b, sum, double };
    });
    const { a, b, double } = graph;
    const reads = [double.read()];
    a.write(2);
    a.write(2); // the same value: nothing to do
    reads.push(double.read());
    fw.withBatch(() => {
        a.write(3);
        b.write(3);
    });
    reads.push(double.read());
    // Back where it started within one batch: nothing changed.
    fw.withBatch(() => {
        a.write(4);
        a.write(3);
    });
    reads.push(double.read());
    fw.cleanup();
    a.write(10);
    return { log, reads };
}

for (const library of LIBRARIES) {
    test(`${library.name}: the adapter answers as documented on a tiny graph`, async () => {
        const fw = await library.load();
        assert.equal(fw.withBuild(() => 42), 42);
        const { log, reads } = tiny(fw);
        assert.deepEqual(reads, [6, 8, 12, 12]);
        // A batch runs the effect once, after it ends; without batching it runs after every write.
        assert.deepEqual(log, library.batching ? [6, 8, 12] : [6, 8, 10, 12, 14, 12]);
    });
}

test('the adapters agree on everything but batching', async () => {
    const answers = [];
    for (const library of LIBRARIES) answers.push(tiny(await library.load()).reads);
    for (const reads of answers) assert.deepEqual(reads, answers[0]);
    assert.deepEqual(
        LIBRARIES.filter((library) => !library.batching).map((library) => library.id),
        ['vue'],
    );
});

for (const library of LIBRARIES) {
    test(`${library.name}: every scenario passes its checks`, async () => {
        const fw = await library.load();
        for (const entry of SCENARIOS) {
            const runner = entry.setup(fw, library);
            try {
                const { ms } = runner.sample(() => {});
                assert.ok(ms >= 0, entry.id);
            } finally {
                runner.done?.();
                fw.cleanup();
            }
        }
    });
}

/**
 * A deliberately naive signal library: computeds recompute eagerly and push
 * to their subscribers at once, in the order they subscribed, with no
 * batching. It is fast on simple graphs and wrong on others; the checks must
 * catch it rather than let it win.
 * @param {{ cutoff?: boolean, stale?: boolean }} [options]
 * @returns {Adapter}
 */
function naive({ cutoff = true, stale = false } = {}) {
    /** @type {{ update(): void } | null} */
    let current = null;
    const track = (/** @type {Set<any>} */ subs) => void (current && subs.add(current));
    return {
        signal(value) {
            /** @type {Set<{ update(): void }>} */
            const subs = new Set();
            return {
                read: () => (track(subs), value),
                write(next) {
                    if (next === value) return;
                    value = next;
                    for (const sub of [...subs]) sub.update();
                },
            };
        },
        computed(fn) {
            /** @type {Set<{ update(): void }>} */
            const subs = new Set();
            /** @type {any} */
            let value;
            let evaluated = false;
            const self = {
                update() {
                    if (stale && evaluated) return;
                    const previous = current;
                    current = self;
                    let next;
                    try {
                        next = fn();
                    } finally {
                        current = previous;
                    }
                    evaluated = true;
                    if (cutoff && next === value) return;
                    value = next;
                    for (const sub of [...subs]) sub.update();
                },
            };
            self.update();
            return { read: () => (track(subs), value) };
        },
        effect(fn) {
            const self = {
                update() {
                    const previous = current;
                    current = self;
                    try {
                        fn();
                    } finally {
                        current = previous;
                    }
                },
            };
            self.update();
        },
        withBatch: (fn) => void fn(),
        withBuild: (fn) => fn(),
        cleanup() {},
    };
}

const NAIVE = { id: 'naive', name: 'naive', package: 'none', module: 'none', batching: false, api: {}, load: async () => naive() };

/** @param {string} id @param {Adapter} fw */
const sample = (id, fw, library = NAIVE) => /** @type {any} */ (scenario(id)).setup(fw, library).sample(() => {});

test('a library that shows a half-updated graph fails the diamond instead of winning', () => {
    // Pushing depth-first, it updates the first branch and recomputes the sum
    // before the other four branches have seen the write.
    assert.throws(() => sample('kairo/diamond', naive()), (error) => error instanceof CheckFailure && /ran \d+ times|different writes/.test(error.message));
});

test('a library that never updates a computed fails', () => {
    assert.throws(() => sample('kairo/deep', naive({ stale: true })), CheckFailure);
    assert.throws(() => sample('cellx/1000', naive({ stale: true })), CheckFailure);
});

test('a library that re-runs effects when nothing changed fails avoidable propagation', () => {
    assert.throws(() => sample('kairo/avoidable', naive({ cutoff: false })), /though nothing it reads changed/);
});

test('a library that claims to batch but does not fails the fan-in', () => {
    assert.throws(() => sample('update/fan-in', naive(), { ...NAIVE, batching: true }), /ran 100 times in a round, not 1/);
});

test('cellx reads the values js-reactivity-benchmark expects', () => {
    const pick = (/** @type {ReturnType<typeof cellxExpected>} */ { before, after }) => ({ before, after });
    assert.deepEqual(pick(cellxExpected(1000)), { before: [-3, -6, -2, 2], after: [-2, -4, 2, 3] });
    assert.deepEqual(pick(cellxExpected(2500)), { before: [-3, -6, -2, 2], after: [-2, -4, 2, 3] });
    assert.deepEqual(pick(cellxExpected(5000)), { before: [2, 4, -1, -6], after: [-2, 1, -4, -4] });
    // Two layers by hand: [1,2,3,4] → [2,-2,6,3] → [-2,-4,1,6], and after the writes
    // [4,3,2,1] → [3,2,4,2] → [2,-1,4,4]: all eight values change once in a batch.
    assert.equal(cellxExpected(2).runs.batched, 8);
    const { runs } = cellxExpected(1000);
    assert.ok(runs.batched > 0 && runs.perWrite >= runs.batched);
});

test('the dynamic graph is planned the same way every time, and its expected sum holds', () => {
    const config = { width: 10, layers: 5, staticFraction: 0.5, inputs: 3, readFraction: 0.5, iterations: 100 };
    assert.deepEqual(planGraph(config), planGraph(config));
    const plan = planGraph(config);
    assert.equal(plan.leaves.length, 5);
    assert.ok(plan.rows.flat().some((node) => node.dynamic) && plan.rows.flat().some((node) => !node.dynamic));
    // A library that recomputes everything on every read (exponential, so a
    // small graph) is slow but right: the plan's sum is what it computes.
    const recompute = { ...naive(), computed: (/** @type {() => any} */ fn) => ({ read: fn }) };
    const small = dynamicGraph('small', 'A small graph', config);
    assert.ok(small.setup(recompute, NAIVE).sample(() => {}).ms >= 0);
    // And the same graph with one input read wrongly does not add up.
    const wrong = { ...recompute, signal: (/** @type {number} */ value) => ({ ...recompute.signal(value), read: () => value + 1 }) };
    assert.throws(() => small.setup(wrong, NAIVE).sample(() => {}), /the leaves add up to/);
});

test('scenario ids are unique and every scenario says what it measures and checks', () => {
    assert.equal(new Set(SCENARIOS.map((entry) => entry.id)).size, SCENARIOS.length);
    for (const entry of SCENARIOS) assert.ok(entry.title && entry.measures && entry.checks, entry.id);
});
