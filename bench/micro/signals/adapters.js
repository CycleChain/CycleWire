/**
 * One interface over four signal libraries, modelled on the ReactiveFramework
 * interface of js-reactivity-benchmark
 * (https://github.com/transitive-bullshit/js-reactivity-benchmark, MIT):
 *
 *   signal(value) → { read(), write(value) }
 *   computed(fn)  → { read() }
 *   effect(fn)       runs fn now, and again whenever something it read changes
 *   withBatch(fn)    runs fn inside the library's batch, when it has one
 *   withBuild(fn)    runs fn inside the library's scope, when it has one, and returns its result
 *   cleanup()        disposes of every effect created so far
 *
 * Every adapter calls the library's documented API with its defaults, and says
 * what it calls in `api`, which the results record. Effect callbacks are
 * wrapped so that what they return is never taken for a cleanup function.
 */

/**
 * @typedef {object} Adapter
 * @property {<T>(value: T) => { read(): T, write(value: T): void }} signal
 * @property {<T>(fn: () => T) => { read(): T }} computed
 * @property {(fn: () => void) => void} effect
 * @property {(fn: () => void) => void} withBatch
 * @property {<T>(fn: () => T) => T} withBuild
 * @property {() => void} cleanup
 */

/**
 * @typedef {object} Library
 * @property {string} id         used on the command line and in the results
 * @property {string} name       the package, as the tables show it
 * @property {string} package    whose installed version is recorded
 * @property {string} module     what is imported
 * @property {boolean} batching  whether withBatch defers effects until the batch ends
 * @property {Record<string, string>} api  what each adapter method calls
 * @property {string} [note]
 * @property {() => Promise<Adapter>} load
 */

/** @type {Library[]} */
export const LIBRARIES = [
    {
        id: 'cyclewire',
        name: 'cyclewire/signals',
        package: 'cyclewire',
        module: 'cyclewire/signals',
        batching: true,
        api: {
            signal: 'signal(value); read .value, write .value = next',
            computed: 'computed(fn); read .value',
            effect: 'effect(fn), keeping the dispose function it returns',
            withBatch: 'batch(fn)',
            withBuild: 'fn() (there is no scope or owner)',
            cleanup: 'calls every dispose function',
        },
        async load() {
            const { signal, computed, effect, batch } = await import('cyclewire/signals');
            /** @type {Array<() => void>} */
            let disposers = [];
            return {
                signal(value) {
                    const s = signal(value);
                    return { read: () => s.value, write: (next) => void (s.value = next) };
                },
                computed(fn) {
                    const c = computed(fn);
                    return { read: () => c.value };
                },
                effect(fn) {
                    disposers.push(effect(() => void fn()));
                },
                withBatch: (fn) => void batch(fn),
                withBuild: (fn) => fn(),
                cleanup() {
                    for (const dispose of disposers) dispose();
                    disposers = [];
                },
            };
        },
    },
    {
        id: 'preact',
        name: '@preact/signals-core',
        package: '@preact/signals-core',
        module: '@preact/signals-core',
        batching: true,
        api: {
            signal: 'signal(value); read .value, write .value = next',
            computed: 'computed(fn); read .value',
            effect: 'effect(fn), keeping the dispose function it returns',
            withBatch: 'batch(fn)',
            withBuild: 'fn() (there is no scope or owner)',
            cleanup: 'calls every dispose function',
        },
        async load() {
            const { signal, computed, effect, batch } = await import('@preact/signals-core');
            /** @type {Array<() => void>} */
            let disposers = [];
            return {
                signal(value) {
                    const s = signal(value);
                    return { read: () => s.value, write: (next) => void (s.value = next) };
                },
                computed(fn) {
                    const c = computed(fn);
                    return { read: () => c.value };
                },
                effect(fn) {
                    disposers.push(effect(() => void fn()));
                },
                withBatch: (fn) => void batch(fn),
                withBuild: (fn) => fn(),
                cleanup() {
                    for (const dispose of disposers) dispose();
                    disposers = [];
                },
            };
        },
    },
    {
        id: 'alien',
        name: 'alien-signals',
        package: 'alien-signals',
        module: 'alien-signals',
        batching: true,
        api: {
            signal: 'signal(value); read s(), write s(next)',
            computed: 'computed(fn); read c()',
            effect: 'effect(fn), inside the build scope, or keeping its stop function outside one',
            withBatch: 'startBatch(); fn(); endBatch()',
            withBuild: 'effectScope(fn), keeping its stop function',
            cleanup: 'stops every scope and every effect made outside one',
        },
        async load() {
            const { signal, computed, effect, effectScope, startBatch, endBatch } = await import('alien-signals');
            /** @type {Array<() => void>} */
            let stops = [];
            let building = 0;
            return {
                signal(value) {
                    const s = signal(value);
                    return { read: () => s(), write: (next) => s(next) };
                },
                computed(fn) {
                    const c = computed(fn);
                    return { read: () => c() };
                },
                effect(fn) {
                    const stop = effect(() => void fn());
                    // Inside a scope, the scope owns the effect and stops it.
                    if (!building) stops.push(stop);
                },
                withBatch(fn) {
                    startBatch();
                    try {
                        fn();
                    } finally {
                        endBatch();
                    }
                },
                withBuild(fn) {
                    let result;
                    building++;
                    try {
                        stops.push(effectScope(() => void (result = fn())));
                    } finally {
                        building--;
                    }
                    return /** @type {any} */ (result);
                },
                cleanup() {
                    for (const stop of stops) stop();
                    stops = [];
                },
            };
        },
    },
    {
        id: 'vue',
        name: '@vue/reactivity',
        package: '@vue/reactivity',
        module: '@vue/reactivity',
        batching: false,
        note: 'Version 3.5 exports no batching function (its startBatch and endBatch are internal), so withBatch runs the function as it is, and effects run after each write. The children run with NODE_ENV=production, which loads its production build.',
        api: {
            signal: 'shallowRef(value); read .value, write .value = next',
            computed: 'computed(fn); read .value',
            effect: 'effect(fn), inside the build scope, or keeping its runner for stop() outside one',
            withBatch: 'fn() (no public batching API)',
            withBuild: 'effectScope().run(fn), keeping the scope',
            cleanup: 'scope.stop() for every scope, stop(runner) for every effect made outside one',
        },
        async load() {
            const { shallowRef, computed, effect, effectScope, stop } = await import('@vue/reactivity');
            /** @type {Array<() => void>} */
            let stops = [];
            let building = 0;
            return {
                signal(value) {
                    const r = shallowRef(value);
                    return { read: () => r.value, write: (next) => void (r.value = next) };
                },
                computed(fn) {
                    const c = computed(fn);
                    return { read: () => c.value };
                },
                effect(fn) {
                    const runner = effect(() => void fn());
                    if (!building) stops.push(() => stop(runner));
                },
                withBatch: (fn) => void fn(),
                withBuild(fn) {
                    const scope = effectScope();
                    stops.push(() => scope.stop());
                    building++;
                    try {
                        return /** @type {any} */ (scope.run(fn));
                    } finally {
                        building--;
                    }
                },
                cleanup() {
                    for (const stopOne of stops) stopOne();
                    stops = [];
                },
            };
        },
    },
];

/** @param {string} id */
export const library = (id) => LIBRARIES.find((entry) => entry.id === id);
