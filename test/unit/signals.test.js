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
