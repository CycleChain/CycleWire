/**
 * The signal scenarios. The kairo set, cellx and the dynamic graphs are ports
 * of js-reactivity-benchmark's scenarios
 * (https://github.com/transitive-bullshit/js-reactivity-benchmark, MIT),
 * rewritten here; the creation and update scenarios are this benchmark's own.
 *
 * Every scenario checks what it computes: values, how often effects ran, and
 * that no computed ever sees a half-updated graph. A check that fails throws,
 * and the run records a failure for that library instead of a time. Checks
 * inside the timed loops are plain comparisons, as in the original, and cost
 * every library the same.
 *
 * A scenario's setup(adapter, library) returns
 *   sample(gc) → { ms, counts? }   one timed sample
 *   done()                         disposes of what setup built
 */
import { prng } from '../../scenario/random.js';

/** @typedef {import('./adapters.js').Adapter} Adapter */
/** @typedef {import('./adapters.js').Library} Library */
/** @typedef {{ ms: number, counts?: Record<string, number> }} Sample */
/** @typedef {{ sample(gc: () => void): Sample, done?(): void }} Runner */
/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} group
 * @property {string} title
 * @property {string} measures  what the timed part does
 * @property {string} checks    what is checked
 * @property {(fw: Adapter, library: Library) => Runner} setup
 */

export class CheckFailure extends Error {
    name = 'CheckFailure';
}

/** @param {string} message @returns {never} */
export function fail(message) {
    throw new CheckFailure(message);
}

const now = () => performance.now();

// The original's busy() loop can be optimised away entirely. Folding its
// result into a module variable keeps it real work, which is the point of
// the "avoidable propagation" scenario: work that need not run.
let sink = 0;
function busy() {
    let a = 0;
    for (let i = 0; i < 100; i++) a += i;
    sink = (sink + a) & 0xffff;
}

// ------------------------------------------------------------------- kairo

/**
 * A kairo scenario builds its graph once; a sample runs its iteration
 * `repeat` times, as js-reactivity-benchmark does (1,000).
 * @param {string} id @param {string} title @param {string} checks
 * @param {(fw: Adapter, counts: Record<string, number>) => () => void} build
 * @returns {Scenario}
 */
function kairo(id, title, checks, build, repeat = 1000) {
    return {
        id: `kairo/${id}`,
        group: 'kairo',
        title,
        measures: `${repeat.toLocaleString('en')} iterations of the scenario's update loop`,
        checks,
        setup(fw) {
            /** @type {Record<string, number>} */
            const counts = {};
            const iterate = fw.withBuild(() => build(fw, counts));
            return {
                sample() {
                    const before = { ...counts };
                    const start = now();
                    for (let r = 0; r < repeat; r++) iterate();
                    const ms = now() - start;
                    const perIteration = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, (value - (before[key] ?? 0)) / repeat]));
                    return { ms, counts: Object.keys(perIteration).length ? perIteration : undefined };
                },
            };
        },
    };
}

const avoidable = kairo(
    'avoidable',
    'Avoidable propagation',
    'The chain ends in a constant, so the effect never runs again and the last computed stays 6.',
    (fw, counts) => {
        counts.evaluations = 0;
        const head = fw.signal(0);
        const computed1 = fw.computed(() => (counts.evaluations++, head.read()));
        const computed2 = fw.computed(() => (counts.evaluations++, computed1.read(), 0));
        const computed3 = fw.computed(() => (counts.evaluations++, busy(), computed2.read() + 1));
        const computed4 = fw.computed(() => (counts.evaluations++, computed3.read() + 2));
        const computed5 = fw.computed(() => (counts.evaluations++, computed4.read() + 3));
        let runs = 0;
        fw.effect(() => {
            computed5.read();
            busy();
            runs++;
        });
        if (runs !== 1) fail(`the effect ran ${runs} times when it was created, not once`);
        return () => {
            const before = runs;
            fw.withBatch(() => head.write(1));
            if (computed5.read() !== 6) fail(`computed5 is ${computed5.read()}, not 6`);
            for (let i = 0; i < 1000; i++) {
                fw.withBatch(() => head.write(i));
                if (computed5.read() !== 6) fail(`computed5 is ${computed5.read()}, not 6`);
            }
            if (runs !== before) fail(`the effect ran ${runs - before} times, though nothing it reads changed`);
        };
    },
);

const broad = kairo('broad', 'Broad propagation', 'Each of 50 writes runs all 50 effects once (2,500 runs), and the last computed is the head plus 50.', (fw) => {
    const head = fw.signal(0);
    /** @type {{ read(): number }} */
    let last = head;
    let runs = 0;
    for (let i = 0; i < 50; i++) {
        const current = fw.computed(() => head.read() + i);
        const current2 = fw.computed(() => current.read() + 1);
        fw.effect(() => {
            current2.read();
            runs++;
        });
        last = current2;
    }
    return () => {
        fw.withBatch(() => head.write(1));
        runs = 0;
        for (let i = 0; i < 50; i++) {
            fw.withBatch(() => head.write(i));
            if (last.read() !== i + 50) fail(`the last computed is ${last.read()}, not ${i + 50}`);
        }
        if (runs !== 2500) fail(`effects ran ${runs} times, not 2,500`);
    };
});

const deep = kairo('deep', 'Deep propagation', 'A chain of 50 computeds ends at the head plus 50, and its effect runs once per write (50 runs).', (fw) => {
    const length = 50;
    const head = fw.signal(0);
    /** @type {{ read(): number }} */
    let current = head;
    for (let i = 0; i < length; i++) {
        const previous = current;
        current = fw.computed(() => previous.read() + 1);
    }
    const end = current;
    let runs = 0;
    fw.effect(() => {
        end.read();
        runs++;
    });
    return () => {
        fw.withBatch(() => head.write(1));
        runs = 0;
        for (let i = 0; i < 50; i++) {
            fw.withBatch(() => head.write(i));
            if (end.read() !== length + i) fail(`the end of the chain is ${end.read()}, not ${length + i}`);
        }
        if (runs !== 50) fail(`the effect ran ${runs} times, not 50`);
    };
});

const diamond = kairo(
    'diamond',
    'Diamond',
    'Five branches join in one sum: the sum is 5 × (head + 1), its effect runs once per write (500 runs), and the sum never sees branches from different writes.',
    (fw) => {
        const width = 5;
        const head = fw.signal(0);
        const branches = Array.from({ length: width }, () => fw.computed(() => head.read() + 1));
        let glitches = 0;
        const sum = fw.computed(() => {
            const values = branches.map((branch) => branch.read());
            for (const value of values) if (value !== values[0]) glitches++;
            return values.reduce((a, b) => a + b, 0);
        });
        let runs = 0;
        fw.effect(() => {
            sum.read();
            runs++;
        });
        return () => {
            fw.withBatch(() => head.write(1));
            if (sum.read() !== 2 * width) fail(`the sum is ${sum.read()}, not ${2 * width}`);
            runs = 0;
            for (let i = 0; i < 500; i++) {
                fw.withBatch(() => head.write(i));
                if (sum.read() !== (i + 1) * width) fail(`the sum is ${sum.read()}, not ${(i + 1) * width}`);
            }
            if (runs !== 500) fail(`the effect ran ${runs} times, not 500`);
            if (glitches) fail(`the sum saw branches from different writes ${glitches} times`);
        };
    },
);

const mux = kairo(
    'mux',
    'Mux',
    'One computed collects 100 signals into an object, 200 computeds split it again: each write reaches only its own effect (18 runs per iteration), with the right value.',
    (fw) => {
        const heads = Array.from({ length: 100 }, () => fw.signal(0));
        const collected = fw.computed(() => Object.fromEntries(heads.map((head) => head.read()).entries()));
        const split = heads.map((_, index) => fw.computed(() => collected.read()[index])).map((part) => fw.computed(() => part.read() + 1));
        let runs = 0;
        for (const part of split) {
            fw.effect(() => {
                part.read();
                runs++;
            });
        }
        return () => {
            runs = 0;
            for (let i = 0; i < 10; i++) {
                fw.withBatch(() => heads[i].write(i));
                if (split[i].read() !== i + 1) fail(`part ${i} is ${split[i].read()}, not ${i + 1}`);
            }
            for (let i = 0; i < 10; i++) {
                fw.withBatch(() => heads[i].write(i * 2));
                if (split[i].read() !== i * 2 + 1) fail(`part ${i} is ${split[i].read()}, not ${i * 2 + 1}`);
            }
            // Writing 0 to heads[0] changes nothing, so 9 of each 10 writes reach an effect.
            if (runs !== 18) fail(`effects ran ${runs} times, not 18`);
        };
    },
);

const repeated = kairo(
    'repeated-observers',
    'Repeated observers',
    'A computed reads the head 30 times: it is 30 × head, and its effect runs once per write (100 runs).',
    (fw) => {
        const size = 30;
        const head = fw.signal(0);
        const current = fw.computed(() => {
            let result = 0;
            for (let i = 0; i < size; i++) result += head.read();
            return result;
        });
        let runs = 0;
        fw.effect(() => {
            current.read();
            runs++;
        });
        return () => {
            fw.withBatch(() => head.write(1));
            if (current.read() !== size) fail(`the computed is ${current.read()}, not ${size}`);
            runs = 0;
            for (let i = 0; i < 100; i++) {
                fw.withBatch(() => head.write(i));
                if (current.read() !== i * size) fail(`the computed is ${current.read()}, not ${i * size}`);
            }
            if (runs !== 100) fail(`the effect ran ${runs} times, not 100`);
        };
    },
);

const triangle = kairo(
    'triangle',
    'Triangle',
    'A chain of 10 whose every link feeds one sum: the sum is 10 × head + 45, its effect runs once per write (100 runs), and the sum never sees links from different writes.',
    (fw) => {
        const width = 10;
        const head = fw.signal(0);
        /** @type {{ read(): number }} */
        let current = head;
        /** @type {Array<{ read(): number }>} */
        const list = [];
        for (let i = 0; i < width; i++) {
            const previous = current;
            list.push(current);
            current = fw.computed(() => previous.read() + 1);
        }
        let glitches = 0;
        const sum = fw.computed(() => {
            const values = list.map((link) => link.read());
            for (let k = 1; k < values.length; k++) if (values[k] !== values[0] + k) glitches++;
            return values.reduce((a, b) => a + b, 0);
        });
        let runs = 0;
        fw.effect(() => {
            sum.read();
            runs++;
        });
        return () => {
            fw.withBatch(() => head.write(1));
            if (sum.read() !== 55) fail(`the sum is ${sum.read()}, not 55`);
            runs = 0;
            for (let i = 0; i < 100; i++) {
                fw.withBatch(() => head.write(i));
                if (sum.read() !== 45 + i * width) fail(`the sum is ${sum.read()}, not ${45 + i * width}`);
            }
            if (runs !== 100) fail(`the effect ran ${runs} times, not 100`);
            if (glitches) fail(`the sum saw links from different writes ${glitches} times`);
        };
    },
);

const unstable = kairo(
    'unstable',
    'Unstable',
    'A computed switches between two dependencies on every write: it is 40 × head for odd heads and −20 × head for even ones, and its effect runs once per write (100 runs).',
    (fw) => {
        const head = fw.signal(0);
        const double = fw.computed(() => head.read() * 2);
        const inverse = fw.computed(() => -head.read());
        const current = fw.computed(() => {
            let result = 0;
            for (let i = 0; i < 20; i++) result += head.read() % 2 ? double.read() : inverse.read();
            return result;
        });
        let runs = 0;
        fw.effect(() => {
            current.read();
            runs++;
        });
        return () => {
            fw.withBatch(() => head.write(1));
            if (current.read() !== 40) fail(`the computed is ${current.read()}, not 40`);
            runs = 0;
            for (let i = 0; i < 100; i++) {
                fw.withBatch(() => head.write(i));
                const expected = i % 2 ? 40 * i : -20 * i;
                if (current.read() !== expected) fail(`the computed is ${current.read()}, not ${expected}`);
            }
            if (runs !== 100) fail(`the effect ran ${runs} times, not 100`);
        };
    },
);

// -------------------------------------------------------------------- cellx

/**
 * cellx's layers, with no library: what the last layer must read before and
 * after the four start values are reversed, and how often the layers'
 * effects must run: in a library that batches, once for each layer value
 * that differs after the batch; in one that does not, once for each value
 * that changes with each of the four writes.
 * @param {number} layers
 */
export function cellxExpected(layers) {
    /** Every layer's four values, from the four start values. @param {number[]} start */
    const valuesFrom = ([p1, p2, p3, p4]) => {
        /** @type {number[][]} */
        const out = [];
        for (let i = 0; i < layers; i++) {
            [p1, p2, p3, p4] = [p2, p1 - p3, p2 + p4, p3];
            out.push([p1, p2, p3, p4]);
        }
        return out;
    };
    /** How many layer values differ between two states. @param {number[][]} a @param {number[][]} b */
    const changed = (a, b) => a.reduce((count, values, i) => count + values.filter((value, k) => value !== b[i][k]).length, 0);
    // The start values after each of the four writes, in the order they are made.
    const states = [
        [1, 2, 3, 4],
        [4, 2, 3, 4],
        [4, 3, 3, 4],
        [4, 3, 2, 4],
        [4, 3, 2, 1],
    ].map(valuesFrom);
    let perWrite = 0;
    for (let k = 1; k < states.length; k++) perWrite += changed(states[k - 1], states[k]);
    return { before: states[0][layers - 1], after: states[4][layers - 1], runs: { batched: changed(states[0], states[4]), perWrite } };
}

/** @param {Adapter} fw @param {number} layers @param {{ runs: number }} counter */
function cellxBuild(fw, layers, counter) {
    const start = { prop1: fw.signal(1), prop2: fw.signal(2), prop3: fw.signal(3), prop4: fw.signal(4) };
    /** @type {Record<'prop1' | 'prop2' | 'prop3' | 'prop4', { read(): number }>} */
    let layer = start;
    for (let i = layers; i > 0; i--) {
        const m = layer;
        const s = {
            prop1: fw.computed(() => m.prop2.read()),
            prop2: fw.computed(() => m.prop1.read() - m.prop3.read()),
            prop3: fw.computed(() => m.prop2.read() + m.prop4.read()),
            prop4: fw.computed(() => m.prop3.read()),
        };
        fw.effect(() => (s.prop1.read(), counter.runs++));
        fw.effect(() => (s.prop2.read(), counter.runs++));
        fw.effect(() => (s.prop3.read(), counter.runs++));
        fw.effect(() => (s.prop4.read(), counter.runs++));
        s.prop1.read();
        s.prop2.read();
        s.prop3.read();
        s.prop4.read();
        layer = s;
    }
    return { start, end: layer };
}

/** @param {number} layers @returns {Scenario} */
function cellx(layers) {
    return {
        id: `cellx/${layers}`,
        group: 'cellx',
        title: `cellx, ${layers.toLocaleString('en')} layers`,
        measures: 'reading the last layer, writing the four start signals in one batch (every layer has four effects), and reading the last layer again; building the layers is not timed',
        checks: 'The last layer reads the values a plain loop computes, before and after, and the effects run exactly once for each value that changed (once per write that changed it, in a library that does not batch).',
        setup(fw, library) {
            const expected = cellxExpected(layers);
            const expectedRuns = library.batching ? expected.runs.batched : expected.runs.perWrite;
            return {
                sample(gc) {
                    const counter = { runs: 0 };
                    const { start, end } = fw.withBuild(() => cellxBuild(fw, layers, counter));
                    gc();
                    counter.runs = 0;
                    const begin = now();
                    const before = [end.prop1.read(), end.prop2.read(), end.prop3.read(), end.prop4.read()];
                    fw.withBatch(() => {
                        start.prop1.write(4);
                        start.prop2.write(3);
                        start.prop3.write(2);
                        start.prop4.write(1);
                    });
                    const after = [end.prop1.read(), end.prop2.read(), end.prop3.read(), end.prop4.read()];
                    const ms = now() - begin;
                    fw.cleanup();
                    if (before.join() !== expected.before.join()) fail(`before: [${before}], not [${expected.before}]`);
                    if (after.join() !== expected.after.join()) fail(`after: [${after}], not [${expected.after}]`);
                    if (counter.runs !== expectedRuns) fail(`effects ran ${counter.runs} times, not ${expectedRuns}`);
                    return { ms };
                },
            };
        },
    };
}

// ------------------------------------------------------------------- create

const COUNT = 100_000;

/** @type {Scenario[]} */
const create = [
    {
        id: 'create/signals',
        group: 'create',
        title: `Create ${COUNT.toLocaleString('en')} signals`,
        measures: 'creating the signals',
        checks: 'Every signal reads the value it was created with.',
        setup(fw) {
            return {
                sample() {
                    const start = now();
                    const signals = fw.withBuild(() => {
                        const list = new Array(COUNT);
                        for (let i = 0; i < COUNT; i++) list[i] = fw.signal(i);
                        return list;
                    });
                    const ms = now() - start;
                    let sum = 0;
                    for (const s of signals) sum += s.read();
                    fw.cleanup();
                    if (sum !== (COUNT * (COUNT - 1)) / 2) fail(`the signals add up to ${sum}`);
                    return { ms };
                },
            };
        },
    },
    {
        id: 'create/computeds',
        group: 'create',
        title: `Create ${COUNT.toLocaleString('en')} computeds and read each once`,
        measures: 'creating one computed over each of the signals, and reading each once (all four libraries evaluate computeds lazily, so a computed nobody reads costs almost nothing); creating the signals is not timed',
        checks: 'Every computed reads its signal plus one.',
        setup(fw) {
            return {
                sample() {
                    const sources = new Array(COUNT);
                    for (let i = 0; i < COUNT; i++) sources[i] = fw.signal(i);
                    const start = now();
                    const sum = fw.withBuild(() => {
                        let total = 0;
                        for (let i = 0; i < COUNT; i++) {
                            const source = sources[i];
                            total += fw.computed(() => source.read() + 1).read();
                        }
                        return total;
                    });
                    const ms = now() - start;
                    fw.cleanup();
                    if (sum !== (COUNT * (COUNT + 1)) / 2) fail(`the computeds add up to ${sum}`);
                    return { ms };
                },
            };
        },
    },
    {
        id: 'create/effects',
        group: 'create',
        title: `Create ${COUNT.toLocaleString('en')} effects`,
        measures: 'creating one effect over each of the signals (each runs once as it is created); creating the signals is not timed',
        checks: 'Every effect ran once and read its signal.',
        setup(fw) {
            return {
                sample() {
                    const sources = new Array(COUNT);
                    for (let i = 0; i < COUNT; i++) sources[i] = fw.signal(i);
                    let runs = 0;
                    let total = 0;
                    const start = now();
                    fw.withBuild(() => {
                        for (let i = 0; i < COUNT; i++) {
                            const source = sources[i];
                            fw.effect(() => {
                                total += source.read();
                                runs++;
                            });
                        }
                    });
                    const ms = now() - start;
                    fw.cleanup();
                    if (runs !== COUNT) fail(`effects ran ${runs} times, not ${COUNT}`);
                    if (total !== (COUNT * (COUNT - 1)) / 2) fail(`the effects read ${total}`);
                    return { ms };
                },
            };
        },
    },
];

// ------------------------------------------------------------------- update

/**
 * 1,000 signals, one effect over each. A round writes a new value to every
 * signal, in one batch or one write at a time.
 * @param {boolean} batched @returns {Scenario}
 */
function manyEffects(batched) {
    const n = 1000;
    const rounds = 100;
    return {
        id: batched ? 'update/batched' : 'update/unbatched',
        group: 'update',
        title: batched ? 'Update 1,000 signals in one batch, one effect each' : 'Update 1,000 signals one write at a time, one effect each',
        measures: `${rounds} rounds, each writing a new value to all ${n.toLocaleString('en')} signals${batched ? ' inside one batch' : ', each write on its own'}`,
        checks: 'Every effect runs once per round and reads the new value.',
        setup(fw) {
            let runs = 0;
            let total = 0;
            const sources = fw.withBuild(() => {
                const list = Array.from({ length: n }, (_, i) => fw.signal(i));
                for (const source of list) {
                    fw.effect(() => {
                        total += source.read();
                        runs++;
                    });
                }
                return list;
            });
            if (runs !== n) fail(`effects ran ${runs} times when created, not ${n}`);
            let round = 0;
            const write = (/** @type {number} */ base) => {
                for (let i = 0; i < n; i++) sources[i].write(base + i);
            };
            return {
                sample() {
                    const start = now();
                    for (let r = 0; r < rounds; r++) {
                        const base = ++round * n;
                        runs = 0;
                        total = 0;
                        if (batched) fw.withBatch(() => write(base));
                        else write(base);
                        if (runs !== n) fail(`effects ran ${runs} times in a round, not ${n}`);
                        if (total !== n * base + (n * (n - 1)) / 2) fail(`the effects read ${total}`);
                    }
                    return { ms: now() - start };
                },
                done: () => fw.cleanup(),
            };
        },
    };
}

/** @type {Scenario} */
const fanIn = {
    id: 'update/fan-in',
    group: 'update',
    title: 'Update 100 signals in one batch, summed by one computed with one effect',
    measures: '1,000 rounds, each writing a new value to all 100 signals inside one batch',
    checks: 'The effect reads the new sum; it runs once per round in a library that batches, and once per write in one that does not.',
    setup(fw, library) {
        const n = 100;
        let runs = 0;
        let seen = 0;
        const sources = fw.withBuild(() => {
            const list = Array.from({ length: n }, (_, i) => fw.signal(i));
            const sum = fw.computed(() => {
                let total = 0;
                for (const source of list) total += source.read();
                return total;
            });
            fw.effect(() => {
                seen = sum.read();
                runs++;
            });
            return list;
        });
        const expectedRuns = library.batching ? 1 : n;
        let round = 0;
        return {
            sample() {
                const start = now();
                for (let r = 0; r < 1000; r++) {
                    const base = ++round * n;
                    runs = 0;
                    fw.withBatch(() => {
                        for (let i = 0; i < n; i++) sources[i].write(base + i);
                    });
                    if (runs !== expectedRuns) fail(`the effect ran ${runs} times in a round, not ${expectedRuns}`);
                    if (seen !== n * base + (n * (n - 1)) / 2) fail(`the effect read ${seen}`);
                }
                return { ms: now() - start };
            },
            done: () => fw.cleanup(),
        };
    },
};

// ------------------------------------------------------------------ dynamic

/**
 * @typedef {object} GraphConfig
 * @property {number} width           signals, and computeds per layer
 * @property {number} layers          layers, the signals included
 * @property {number} staticFraction  the share of computeds that always read all their inputs
 * @property {number} inputs          how many nodes of the layer above each computed reads
 * @property {number} readFraction    the share of the last layer read after each write
 * @property {number} iterations      writes
 */

/**
 * Plans a rectangular graph, as js-reactivity-benchmark's makeGraph does,
 * with this benchmark's seeded generator: which computeds are dynamic, which
 * leaves are read, and, from a plain evaluation without any library, the sum
 * the leaves must add up to after the last write.
 * @param {GraphConfig} config
 */
export function planGraph({ width, layers, staticFraction, inputs, readFraction, iterations }) {
    const random = prng(1);
    /** @type {Array<Array<{ inputs: number[], dynamic: boolean }>>} */
    const rows = [];
    for (let l = 0; l < layers - 1; l++) {
        rows.push(
            Array.from({ length: width }, (_, index) => ({
                inputs: Array.from({ length: inputs }, (_, k) => (index + k) % width),
                dynamic: !(random() < staticFraction),
            })),
        );
    }
    const pick = prng(2);
    const leaves = Array.from({ length: width }, (_, i) => i);
    const skip = Math.round(width * (1 - readFraction));
    for (let i = 0; i < skip; i++) leaves.splice(Math.floor(pick() * leaves.length), 1);

    // Each write sets source (i % width) to i + (i % width).
    let values = Array.from({ length: width }, (_, i) => i);
    for (let i = 0; i < iterations; i++) values[i % width] = i + (i % width);
    for (const row of rows) {
        const above = values;
        values = row.map((node) => evaluate(node.dynamic, node.inputs.map((index) => () => above[index])));
    }
    const expected = leaves.reduce((total, index) => values[index] + total, 0);
    return { rows, leaves, expected };
}

/**
 * One node of the graph. Static nodes add all their inputs; dynamic nodes
 * skip one of their other inputs when the first is odd, so what they read
 * changes with the data.
 * @param {boolean} dynamic @param {Array<() => number>} read
 */
function evaluate(dynamic, read) {
    if (!dynamic) {
        let sum = 0;
        for (const input of read) sum += input();
        return sum;
    }
    let sum = read[0]();
    const shouldDrop = sum & 0x1;
    const dropIndex = sum % (read.length - 1);
    for (let i = 1; i < read.length; i++) {
        if (shouldDrop && i - 1 === dropIndex) continue;
        sum += read[i]();
    }
    return sum;
}

/**
 * @param {Adapter} fw @param {GraphConfig} config
 * @param {ReturnType<typeof planGraph>} plan @param {{ count: number }} counter
 */
function buildGraph(fw, config, plan, counter) {
    const sources = Array.from({ length: config.width }, (_, i) => fw.signal(i));
    /** @type {Array<{ read(): number }>} */
    let above = sources;
    for (const row of plan.rows) {
        const layer = above;
        above = row.map((node) => {
            const reads = node.inputs.map((index) => layer[index].read);
            return fw.computed(() => {
                counter.count++;
                return evaluate(node.dynamic, reads);
            });
        });
    }
    return { sources, leaves: plan.leaves.map((index) => above[index]) };
}

/** @param {string} id @param {string} title @param {GraphConfig} config @returns {Scenario} */
export function dynamicGraph(id, title, config) {
    return {
        id: `dynamic/${id}`,
        group: 'dynamic',
        title,
        measures: `${config.iterations.toLocaleString('en')} writes to one signal each, reading ${config.readFraction === 1 ? 'every leaf' : `${Math.round(config.readFraction * 100)}% of the leaves`} after each; building the graph is not timed`,
        checks: 'The leaves add up to what a plain evaluation of the same graph gives. How many times computeds ran is recorded, not checked.',
        setup(fw) {
            const plan = planGraph(config);
            return {
                sample(gc) {
                    const counter = { count: 0 };
                    const { sources, leaves } = fw.withBuild(() => buildGraph(fw, config, plan, counter));
                    gc();
                    const start = now();
                    for (let i = 0; i < config.iterations; i++) {
                        const index = i % sources.length;
                        sources[index].write(i + index);
                        for (const leaf of leaves) leaf.read();
                    }
                    const sum = leaves.reduce((total, leaf) => leaf.read() + total, 0);
                    const ms = now() - start;
                    fw.cleanup();
                    if (sum !== plan.expected) fail(`the leaves add up to ${sum}, not ${plan.expected}`);
                    return { ms, counts: { evaluations: counter.count } };
                },
            };
        },
    };
}

/** @type {Scenario[]} */
export const SCENARIOS = [
    avoidable,
    broad,
    deep,
    diamond,
    mux,
    repeated,
    triangle,
    unstable,
    cellx(1000),
    cellx(2500),
    ...create,
    manyEffects(true),
    manyEffects(false),
    fanIn,
    dynamicGraph('component', 'Dynamic component: 10 wide, 10 layers, a quarter of the computeds dynamic, a fifth of the leaves read', {
        width: 10,
        layers: 10,
        staticFraction: 3 / 4,
        inputs: 6,
        readFraction: 0.2,
        iterations: 15_000,
    }),
    dynamicGraph('very-dynamic', 'Very dynamic: 100 wide, 15 layers, half the computeds dynamic', {
        width: 100,
        layers: 15,
        staticFraction: 0.5,
        inputs: 6,
        readFraction: 1,
        iterations: 2000,
    }),
];

/** @param {string} id */
export const scenario = (id) => SCENARIOS.find((entry) => entry.id === id);
