/**
 * The morph test page's harness: loads one library (?lib=), and gives the
 * runner window.micro to run a correctness case, time one operation on a
 * fresh copy of the rows, or count the mutations one operation makes.
 */
import { LIBRARIES } from './adapters.js';
import { canonical, difference } from './canonical.js';
import { CASES, defineCounter } from './cases.js';
import { OPERATIONS, listMarkup } from './rows.js';

const library = LIBRARIES.find((entry) => entry.id === new URLSearchParams(location.search).get('lib'));
if (!library) throw new Error(`Unknown library ${location.search}`);
const morph = await library.load();
defineCounter();

const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
const speed = /** @type {HTMLElement} */ (document.getElementById('speed'));
const gc = /** @type {(() => void) | undefined} */ (/** @type {any} */ (globalThis).gc);

/** The smallest step performance.now() takes, in ms. */
function timerResolution() {
    let smallest = Infinity;
    for (let i = 0; i < 20; i++) {
        const a = performance.now();
        let b = performance.now();
        while (b === a) b = performance.now();
        smallest = Math.min(smallest, b - a);
    }
    return Math.round(smallest * 1e6) / 1e6;
}

/** @type {Map<string, { from: string, to: string, expected: string, kept: string[] }>} */
const prepared = new Map();
/** @param {string} id */
function prepare(id) {
    let entry = prepared.get(id);
    if (!entry) {
        const operation = OPERATIONS.find((item) => item.id === id);
        if (!operation) throw new Error(`Unknown operation ${id}`);
        const to = operation.to();
        const probe = document.createElement('div');
        probe.innerHTML = to;
        entry = { from: operation.from ? listMarkup(operation.from) : '', to, expected: canonical(probe), kept: operation.kept() };
        prepared.set(id, entry);
    }
    return entry;
}

/** A fresh copy of the starting rows, laid out, with the page idle. @param {{ from: string }} entry */
async function fresh(entry) {
    speed.innerHTML = entry.from;
    void speed.offsetHeight;
    await new Promise((resolve) => setTimeout(resolve, 0));
    /** @type {Map<string, Element>} */
    const before = new Map();
    for (const el of speed.children) if (el.id) before.set(el.id, el);
    return before;
}

/**
 * Whether the container now holds the target, and how many of the rows that
 * should have stayed the same elements did.
 * @param {{ expected: string, kept: string[] }} entry @param {Map<string, Element>} before
 */
function verify(entry, before) {
    const problem = difference(canonical(speed), entry.expected);
    /** @type {Map<string, Element>} */
    const after = new Map();
    for (const el of speed.children) if (el.id) after.set(el.id, el);
    let kept = 0;
    for (const id of entry.kept) if (after.get(id) === before.get(id)) kept++;
    return { ok: !problem, problem: problem ? `the markup ${problem}` : null, kept, expectedKept: entry.kept.length };
}

const micro = {
    library: library.id,
    ready: false,
    info: () => ({
        crossOriginIsolated,
        timerResolutionMs: timerResolution(),
        moveBefore: typeof (/** @type {any} */ (Element.prototype).moveBefore) === 'function',
        gc: typeof gc === 'function',
        userAgent: navigator.userAgent,
    }),

    /** @param {string} id */
    runCase(id) {
        const entry = CASES.find((item) => item.id === id);
        if (!entry) throw new Error(`Unknown case ${id}`);
        const container = document.createElement('div');
        container.className = 'case';
        stage.append(container);
        container.innerHTML = entry.before;
        void container.offsetHeight;
        const target = document.createElement('div');
        target.innerHTML = entry.after;
        /** @type {string[]} */
        let problems;
        try {
            const state = entry.prepare?.(container) ?? {};
            morph(container, entry.after);
            problems = entry.check(container, state, { target });
        } catch (error) {
            const failure = /** @type {Error} */ (error);
            problems = [`threw ${failure.name}: ${failure.message}`];
        }
        return { pass: problems.length === 0, problems };
    },

    /** One timed morph on a fresh copy of the rows. @param {string} id */
    async sample(id) {
        const entry = prepare(id);
        const before = await fresh(entry);
        gc?.();
        const start = performance.now();
        morph(speed, entry.to);
        const morphed = performance.now();
        void speed.offsetHeight;
        const laidOut = performance.now();
        return { ms: morphed - start, withLayout: laidOut - start, ...verify(entry, before) };
    },

    /** The same morph, untimed, with a MutationObserver counting what changed. @param {string} id */
    async mutations(id) {
        const entry = prepare(id);
        const before = await fresh(entry);
        const observer = new MutationObserver(() => {});
        observer.observe(speed, { subtree: true, childList: true, attributes: true, characterData: true });
        morph(speed, entry.to);
        const records = observer.takeRecords();
        observer.disconnect();
        const counts = { records: records.length, childList: 0, attributes: 0, characterData: 0, added: 0, removed: 0 };
        for (const record of records) {
            counts[record.type]++;
            counts.added += record.addedNodes.length;
            counts.removed += record.removedNodes.length;
        }
        return { ...counts, ...verify(entry, before) };
    },
};

Object.assign(globalThis, { micro });
micro.ready = true;
