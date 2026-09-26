import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batch, computed, effect, reactive, signal, toRaw, untracked } from '../../src/signals.js';

test('an effect runs now and again after each change', () => {
    const count = signal(1);
    const seen = [];
    const dispose = effect(() => seen.push(count.value));
    count.value = 2;
    count.value = 2; // same value: no run
    count.value = 3;
    dispose();
    count.value = 4;
    assert.deepEqual(seen, [1, 2, 3]);
});

test('computed values are lazy and cached', () => {
    const count = signal(1);
    let runs = 0;
    const double = computed(() => {
        runs++;
        return count.value * 2;
    });
    assert.equal(runs, 0);
    assert.equal(double.value, 2);
    assert.equal(double.value, 2);
    assert.equal(runs, 1);
    count.value = 5;
    assert.equal(runs, 1);
    assert.equal(double.peek(), 10);
    assert.equal(runs, 2);
});

test('a diamond updates its effect once, never with a torn value', () => {
    const a = signal(1);
    const b = computed(() => a.value + 1);
    const c = computed(() => a.value * 10);
    const seen = [];
    effect(() => seen.push(`${b.value}/${c.value}`));
    a.value = 2;
    assert.deepEqual(seen, ['2/10', '3/20']);
});

test('an unchanged derived value does not rerun downstream effects', () => {
    const n = signal(2);
    const even = computed(() => n.value % 2 === 0);
    let runs = 0;
    effect(() => {
        even.value;
        runs++;
    });
    n.value = 4;
    n.value = 6;
    assert.equal(runs, 1);
    n.value = 7;
    assert.equal(runs, 2);
});

test('a computed does not run again when nothing it read changed', () => {
    const n = signal(0);
    const zero = computed(() => (n.value, 0));
    let runs = 0;
    const next = computed(() => {
        runs++;
        return zero.value + 1;
    });
    const dispose = effect(() => next.value);
    n.value = 1;
    n.value = 2;
    assert.equal(runs, 1);
    dispose();
});

test('a run that reads other sources lets go of the old ones', () => {
    const left = signal(true);
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const dispose = effect(() => {
        runs++;
        return left.value ? a.value : b.value;
    });
    left.value = false;
    a.value = 10; // no longer read
    assert.equal(runs, 2);
    b.value = 20;
    assert.equal(runs, 3);
    dispose();
});

test('a run that stops early lets go of what it did not reach', () => {
    const done = signal(false);
    const later = signal(1);
    let runs = 0;
    const dispose = effect(() => {
        runs++;
        if (!done.value) later.value;
    });
    done.value = true;
    later.value = 2;
    assert.equal(runs, 2);
    dispose();
});

test('reading a source many times in a row subscribes once', () => {
    const n = signal(1);
    let sum = 0;
    const dispose = effect(() => {
        sum = 0;
        for (let i = 0; i < 30; i++) sum += n.value;
    });
    n.value = 2;
    assert.equal(sum, 60);
    dispose();
});

test('a computed that threw runs again the next time it is read', () => {
    const n = signal(0);
    let runs = 0;
    const inverse = computed(() => {
        runs++;
        if (n.value === 0) throw new Error('zero');
        return 1 / n.value;
    });
    assert.throws(() => inverse.value, /zero/);
    assert.throws(() => inverse.value, /zero/);
    assert.equal(runs, 2);
    n.value = 4;
    assert.equal(inverse.value, 0.25);
});

test('an effect disposed during its own run does not run again', () => {
    const stop = signal(0);
    const other = signal(0);
    let runs = 0;
    const disposers = [];
    disposers.push(effect(() => {
        runs++;
        if (stop.value) disposers[0]();
        other.value;
    }));
    stop.value = 1;
    other.value = 1;
    assert.equal(runs, 2);
});

test('batch defers effects until the outermost batch ends', () => {
    const first = signal('Ada');
    const last = signal('Lovelace');
    const seen = [];
    effect(() => seen.push(`${first.value} ${last.value}`));
    batch(() => {
        first.value = 'Grace';
        last.value = 'Hopper';
        batch(() => {
            first.value = 'Grace B.';
        });
        assert.equal(seen.length, 1);
    });
    assert.deepEqual(seen, ['Ada Lovelace', 'Grace B. Hopper']);
});

test('untracked reads do not subscribe', () => {
    const tracked = signal(1);
    const ignored = signal(1);
    let runs = 0;
    effect(() => {
        tracked.value;
        untracked(() => ignored.value);
        runs++;
    });
    ignored.value = 2;
    assert.equal(runs, 1);
    tracked.value = 2;
    assert.equal(runs, 2);
});

test('effect cleanups run before each rerun and on dispose', () => {
    const on = signal(1);
    const events = [];
    const dispose = effect(() => {
        const value = on.value;
        events.push(`run ${value}`);
        return () => events.push(`cleanup ${value}`);
    });
    on.value = 2;
    dispose();
    assert.deepEqual(events, ['run 1', 'cleanup 1', 'run 2', 'cleanup 2']);
});

test('subscribe is an effect over one signal', () => {
    const s = signal('a');
    const seen = [];
    const off = s.subscribe((value) => seen.push(value));
    s.value = 'b';
    off();
    s.value = 'c';
    assert.deepEqual(seen, ['a', 'b']);
});

test('a throwing effect does not stop the others', () => {
    const s = signal(0);
    const seen = [];
    effect(() => {
        if (s.value === 1) throw new Error('bad');
    });
    effect(() => seen.push(s.value));
    assert.throws(() => {
        s.value = 1;
    }, /bad/);
    assert.deepEqual(seen, [0, 1]);
});

test('runaway effects are stopped', () => {
    const s = signal(0);
    assert.throws(() => effect(() => {
        s.value = s.value + 1;
    }), /re-triggering/);
});

test('reactive objects track reads per property, deeply', () => {
    const state = reactive({ user: { name: 'Ada' }, count: 0 });
    const names = [];
    const counts = [];
    effect(() => names.push(state.user.name));
    effect(() => counts.push(state.count));
    state.count++;
    state.user.name = 'Grace';
    state.user = { name: 'Hedy' };
    assert.deepEqual(names, ['Ada', 'Grace', 'Hedy']);
    assert.deepEqual(counts, [0, 1]);
});

test('reactive arrays notify on push, splice and length changes', () => {
    const list = reactive({ items: ['a'] });
    const seen = [];
    effect(() => seen.push(list.items.join(',')));
    list.items.push('b');
    list.items.splice(0, 1);
    list.items.length = 0;
    assert.deepEqual(seen, ['a', 'a,b', 'b', '']);
});

test('adding and deleting keys notifies iteration and `in`', () => {
    const state = reactive({});
    const keys = [];
    const has = [];
    effect(() => keys.push(Object.keys(state).join(',')));
    effect(() => has.push('x' in state));
    state.x = 1;
    delete state.x;
    assert.deepEqual(keys, ['', 'x', '']);
    assert.deepEqual(has, [false, true, false]);
});

test('getters on reactive objects track what they read', () => {
    const cart = reactive({
        items: [{ price: 2 }],
        get total() {
            return this.items.reduce((sum, item) => sum + item.price, 0);
        },
    });
    const totals = [];
    effect(() => totals.push(cart.total));
    cart.items.push({ price: 3 });
    cart.items[0].price = 10;
    assert.deepEqual(totals, [2, 5, 13]);
});

test('toRaw returns the plain object and proxies are reused', () => {
    const raw = { a: 1 };
    const proxy = reactive(raw);
    assert.equal(toRaw(proxy), raw);
    assert.equal(reactive(raw), proxy);
    assert.equal(reactive(proxy), proxy);
    // Only plain objects and arrays become reactive.
    const date = new Date();
    assert.equal(reactive(date), date);
});

test('two copies of the module share one reactive graph', async () => {
    const copy = await import('../../src/signals.js?copy');
    assert.equal(copy.signal, signal);
    const s = copy.signal(1);
    const seen = [];
    effect(() => seen.push(s.value));
    s.value = 2;
    assert.deepEqual(seen, [1, 2]);
});
