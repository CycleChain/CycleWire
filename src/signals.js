/**
 * cyclewire/signals — fine-grained reactivity that resumes from state the
 * server serialized into the page, instead of re-rendering it.
 *
 *   <section cw-state='{"count": 2}'>
 *     <output cw-bind="text: count">2</output>
 *     <button cw-action="counter#inc">+1</button>
 *   </section>
 *
 * Nothing runs on page load: the server already rendered the right DOM. A
 * scope's JSON is parsed, and its bindings wired, the first time something
 * touches it (an action reading `ctx.state`, the user typing into a bound
 * input, or your code calling `stateOf()` / `store()`).
 */

const KEY = Symbol.for('cyclewire.signals');

// Attributes whose value the browser can load or run as a URL (SVG animations included).
// A `;` starts a new item in SVG's `values`, so every item is checked.
const URL_ATTRS = /^(?:href|src|action|formaction|poster|cite|background|ping|codebase|data|xlink:href|to|from|by|values)$/i;
const UNSAFE_URL = /^(?:javascript|vbscript):/i;

/**
 * @template T
 * @typedef {object} ReadonlySignal
 * @property {T} value           reading inside an effect or computed subscribes to changes
 * @property {() => T} peek      read without subscribing
 * @property {(fn: (value: T) => void) => () => void} subscribe  runs fn now and on every change; returns an unsubscribe function
 */

/**
 * @template T
 * @typedef {ReadonlySignal<T> & { value: T }} Signal
 */

/**
 * @typedef {object} Binding
 * @property {string} directive  text | value | checked | show | hide | class.<name> | attr.<name> | style.<property>
 * @property {string[]} path
 * @property {boolean} negate
 * @property {string} store      named store, or "" for the element's scope
 */

function create() {
    // ---------------------------------------------------------------- core

    /**
     * A computed or an effect: the sources its last run read, in order, with
     * the version of each it saw. A run walks that list with `cursor` while
     * it reads the same sources in the same order, and only makes lists of
     * its own (`next`, `seen`) from the first read that differs.
     * A run stamps what it reads with its own number (`stamp`), so a source
     * it reads again is not listed twice.
     * @typedef {{ deps: Source[], vers: number[], cursor: number, next: Source[] | null, seen: number[], stamp: number, off?: boolean, stale(): void }} Computation
     */

    /** @type {Computation | null} */
    let observer = null;
    let depth = 0;
    let flushing = false;
    /** What a computation that never ran has read: shared, never written to. */
    const NONE = /** @type {any[]} */ ([]);
    /** Numbers runs, and each comparison of a run's reads with the last run's. */
    let epoch = 0;

    /**
     * A source's subscribers: none, one, or a set of them. Most sources have
     * one, and a set for each would cost more than the source itself.
     * @param {Source} source @param {Computation} sub
     */
    const subscribe = (source, sub) => {
        const subs = source.subs;
        if (!subs) source.subs = sub;
        else if (subs instanceof Set) subs.add(sub);
        else if (subs !== sub) source.subs = new Set([subs, sub]);
    };
    /** @param {Source} source @param {Computation} sub */
    const release = (source, sub) => {
        const subs = source.subs;
        if (subs === sub) source.subs = null;
        else if (subs instanceof Set) subs.delete(sub);
    };
    /** Marks every subscriber stale; that only marks and queues, so the set does not change while it is walked. @param {Source} source */
    const stale = ({ subs }) => {
        if (subs instanceof Set) for (const sub of subs) sub.stale();
        else subs?.stale();
    };
    /** @type {Set<Effect>} */
    const queue = new Set();

    class Source {
        constructor() {
            /** @type {Computation | Set<Computation> | null} */
            this.subs = null;
            this.version = 0;
            this.mark = 0;
        }

        track() {
            const o = observer;
            // Read already in this run: nothing to add.
            if (!o || this.mark === o.stamp) return;
            this.mark = o.stamp;
            // The version read: a later write, even one made by the reader itself, is a change.
            if (!o.next) {
                const i = o.cursor;
                // What the last run read here: subscribed already.
                if (o.deps[i] === this) {
                    o.vers[i] = this.version;
                    o.cursor++;
                    return;
                }
                o.next = i ? o.deps.slice(0, i) : [];
                o.seen = i ? o.vers.slice(0, i) : [];
            }
            o.next.push(this);
            o.seen.push(this.version);
            subscribe(this, o);
        }

        notify() {
            depth++;
            try {
                stale(this);
            } finally {
                if (!--depth) flush();
            }
        }

        refresh() {}
    }

    /** @template T */
    class SignalImpl extends Source {
        /** @param {T} value */
        constructor(value) {
            super();
            this.v = value;
        }

        get value() {
            this.track();
            return this.v;
        }

        set value(next) {
            if (Object.is(next, this.v)) return;
            this.v = next;
            this.version++;
            this.notify();
        }

        peek() {
            return this.v;
        }

        /** @param {(value: T) => void} fn */
        subscribe(fn) {
            return effect(() => fn(this.value));
        }
    }

    /** @template T */
    class ComputedImpl extends Source {
        /** @param {() => T} fn */
        constructor(fn) {
            super();
            this.fn = fn;
            /** @type {Source[]} */
            this.deps = this.vers = NONE;
            this.cursor = this.stamp = 0;
            this.next = this.seen = null;
            this.dirty = true;
            /** @type {T | undefined} */
            this.v = undefined;
        }

        stale() {
            if (this.dirty) return;
            this.dirty = true;
            stale(this);
        }

        refresh() {
            if (!this.dirty) return;
            this.dirty = false;
            try {
                // A write upstream only marks this stale: it runs again only
                // if something it read has really changed since.
                if (this.version && !changed(/** @type {any} */ (this))) return;
                const value = execute(/** @type {any} */ (this), this.fn);
                // Downstream work only reruns when the derived value really changed.
                if (!this.version || !Object.is(value, this.v)) {
                    this.v = value;
                    this.version++;
                }
            } catch (error) {
                // Asked again, it tries again.
                this.dirty = true;
                throw error;
            }
        }

        get value() {
            this.refresh();
            this.track();
            return /** @type {T} */ (this.v);
        }

        peek() {
            this.refresh();
            return /** @type {T} */ (this.v);
        }

        /** @param {(value: T) => void} fn */
        subscribe(fn) {
            return effect(() => fn(this.value));
        }
    }

    class Effect {
        /** @param {() => unknown} fn */
        constructor(fn) {
            this.fn = fn;
            /** @type {Source[]} */
            this.deps = this.vers = NONE;
            this.cursor = this.stamp = 0;
            this.next = this.seen = null;
            /** @type {unknown} */
            this.cleanup = undefined;
            this.off = false;
        }

        stale() {
            if (!this.off) queue.add(this);
        }

        run() {
            // Only its first run finds it with nothing read: an effect that
            // read nothing is never queued again.
            if (this.off || (this.deps !== NONE && !changed(/** @type {any} */ (this)))) return;
            if (typeof this.cleanup === 'function') this.cleanup();
            this.cleanup = execute(/** @type {any} */ (this), this.fn);
        }

        dispose() {
            this.off = true;
            unsubscribe(/** @type {any} */ (this));
            queue.delete(this);
            if (typeof this.cleanup === 'function') this.cleanup();
        }
    }

    /**
     * Whether a source the computation read has a new version since. Sources
     * are refreshed in the order they were read, and the first change ends
     * the check: what came after may not be read at all next time.
     * @param {Computation} computation
     */
    function changed({ deps, vers }) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].refresh();
            if (deps[i].version !== vers[i]) return true;
        }
        return false;
    }

    /** @param {Computation} computation */
    function unsubscribe(computation) {
        for (const dep of computation.deps) release(dep, computation);
        computation.deps = computation.vers = NONE;
    }

    /**
     * Runs fn with `computation` collecting the sources it reads. A run that
     * reads what the last one read, in the same order, changes no
     * subscription; otherwise the sources it no longer reads let it go.
     * @template T
     * @param {Computation} computation
     * @param {() => T} fn
     * @returns {T}
     */
    function execute(computation, fn) {
        const previous = observer;
        const old = computation.deps;
        computation.cursor = 0;
        computation.next = null;
        computation.stamp = ++epoch;
        observer = computation;
        try {
            return fn();
        } finally {
            observer = previous;
            // (The cast forgets the null assigned above: fn has changed it since.)
            let { next, seen, cursor } = /** @type {Computation} */ (computation);
            // It read the last run's first sources and stopped early.
            if (!next && cursor < old.length) {
                next = old.slice(0, cursor);
                seen = computation.vers.slice(0, cursor);
            }
            if (next) {
                if (old.length) {
                    const mark = ++epoch;
                    for (const dep of next) dep.mark = mark;
                    for (const dep of old) if (dep.mark !== mark) release(dep, computation);
                }
                computation.deps = next;
                computation.vers = seen;
                computation.next = null;
            }
            // Disposed while it ran: what it read after that subscribed it again.
            if (computation.off) unsubscribe(computation);
        }
    }

    function flush() {
        if (flushing) return;
        flushing = true;
        /** @type {unknown} */
        let failure;
        try {
            for (let rounds = 0; queue.size; rounds++) {
                if (rounds > 100) {
                    queue.clear();
                    throw new Error('[CycleWire] effects kept re-triggering each other');
                }
                const effects = [...queue];
                queue.clear();
                for (const e of effects) {
                    try {
                        e.run();
                    } catch (error) {
                        failure ??= error;
                    }
                }
            }
        } finally {
            flushing = false;
        }
        if (failure) throw failure;
    }

    /**
     * A reactive value.
     * @template T
     * @param {T} value
     * @returns {Signal<T>}
     */
    function signal(value) {
        return /** @type {any} */ (new SignalImpl(value));
    }

    /**
     * A lazily evaluated value derived from other signals.
     * @template T
     * @param {() => T} fn
     * @returns {ReadonlySignal<T>}
     */
    function computed(fn) {
        return /** @type {any} */ (new ComputedImpl(fn));
    }

    /**
     * Runs fn now and again whenever a signal it read changes. fn may return
     * a cleanup function, which runs before the next run and on dispose.
     * @param {() => unknown} fn
     * @returns {() => void} dispose
     */
    function effect(fn) {
        const e = new Effect(fn);
        // Writes made during the first run are flushed afterwards, not
        // re-entrantly in the middle of it, as in a batch.
        depth++;
        try {
            e.run();
        } catch (error) {
            e.dispose();
            throw error;
        } finally {
            if (!--depth) flush();
        }
        return () => e.dispose();
    }

    /**
     * Groups writes so effects run once, after fn returns.
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    function batch(fn) {
        depth++;
        try {
            return fn();
        } finally {
            if (!--depth) flush();
        }
    }

    /**
     * Reads signals without subscribing to them.
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    function untracked(fn) {
        const previous = observer;
        observer = null;
        try {
            return fn();
        } finally {
            observer = previous;
        }
    }

    // ------------------------------------------------------------ reactive

    const RAW = Symbol('raw');
    const ITERATE = Symbol('iterate');
    const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
    /** @type {WeakMap<object, object>} */
    const proxies = new WeakMap();
    /** @type {WeakMap<object, Map<PropertyKey, SignalImpl<number>>>} */
    const keys = new WeakMap();

    /** @param {object} target @param {PropertyKey} key */
    function track(target, key) {
        if (!observer) return;
        let map = keys.get(target);
        if (!map) keys.set(target, (map = new Map()));
        let s = map.get(key);
        if (!s) map.set(key, (s = new SignalImpl(0)));
        s.track();
    }

    /** @param {object} target @param {PropertyKey} key */
    function trigger(target, key) {
        const s = keys.get(target)?.get(key);
        if (s) s.value = s.v + 1;
    }

    /** @param {unknown} value */
    const proxiable = (value) => {
        if (!value || typeof value !== 'object') return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null || Array.isArray(value);
    };

    /**
     * The plain object behind a reactive proxy.
     * @template T
     * @param {T} value
     * @returns {T}
     */
    const toRaw = (value) => (value && /** @type {any} */ (value)[RAW]) || value;

    /** @type {ProxyHandler<any>} */
    const handler = {
        get(target, key, receiver) {
            if (key === RAW) return target;
            if (Array.isArray(target) && MUTATORS.has(/** @type {string} */ (key))) {
                // One notification per call: splice moves every item one by one,
                // and nobody should see the halfway states.
                const method = /** @type {any} */ (Array.prototype)[key];
                return (/** @type {unknown[]} */ ...args) => batch(() => untracked(() => method.apply(receiver, args)));
            }
            const value = Reflect.get(target, key, receiver);
            if (typeof key !== 'symbol') track(target, key);
            return proxiable(value) ? reactive(value) : value;
        },
        set(target, key, value, receiver) {
            const had = Object.prototype.hasOwnProperty.call(target, key);
            const old = target[key];
            const length = Array.isArray(target) ? target.length : 0;
            const ok = Reflect.set(target, key, toRaw(value), receiver);
            if (ok && (!had || !Object.is(old, target[key]))) {
                batch(() => {
                    trigger(target, key);
                    if (!had) trigger(target, ITERATE);
                    if (Array.isArray(target) && target.length !== length) {
                        trigger(target, 'length');
                        trigger(target, ITERATE);
                        // Truncation drops indices nobody wrote to.
                        for (let i = target.length; i < length; i++) trigger(target, String(i));
                    }
                });
            }
            return ok;
        },
        deleteProperty(target, key) {
            const had = Object.prototype.hasOwnProperty.call(target, key);
            const ok = Reflect.deleteProperty(target, key);
            if (had && ok) {
                batch(() => {
                    trigger(target, key);
                    trigger(target, ITERATE);
                });
            }
            return ok;
        },
        has(target, key) {
            if (typeof key !== 'symbol') track(target, key);
            return Reflect.has(target, key);
        },
        ownKeys(target) {
            track(target, ITERATE);
            return Reflect.ownKeys(target);
        },
    };

    /**
     * A deeply reactive view of a plain object or array: reads inside effects
     * subscribe per property, writes (including push/splice) notify.
     * @template {object} T
     * @param {T} value
     * @returns {T}
     */
    function reactive(value) {
        if (!proxiable(value) || /** @type {any} */ (value)[RAW]) return value;
        let proxy = proxies.get(value);
        if (!proxy) proxies.set(value, (proxy = new Proxy(value, handler)));
        return /** @type {T} */ (proxy);
    }

    // ------------------------------------------------------------------ DOM

    let prefix = 'cw-';
    /** @param {string} name */
    const attr = (name) => (prefix || 'data-') + name;
    /** @type {WeakMap<Element, any>} */
    const scopes = new WeakMap();
    /** @type {Map<string, any>} */
    const stores = new Map();
    /** @type {WeakMap<Element, Set<number>>} */
    const bound = new WeakMap();
    /** Roots searched for elements bound to named stores. @type {Set<Document | ShadowRoot>} */
    const roots = new Set();
    /** @type {Map<string, Binding[]>} */
    const parsed = new Map();
    /** The control whose input is being written back; bindings never overwrite it mid-edit. @type {Element | null} */
    let editing = null;

    /**
     * Bindings, scopes and store seeds inside cw-ignore stay inert, like
     * actions: user content must not be able to bind to the page's state.
     * @param {Node | null} node
     */
    const ignored = (node) => {
        for (let current = /** @type {any} */ (node); current; current = current.parentNode || current.host) {
            if (current.nodeType === 1 && current.hasAttribute(attr('ignore'))) return true;
        }
        return false;
    };

    /**
     * `text: count; class.active: open; attr.aria-expanded: !collapsed; text: $cart.total`
     * @param {string} source
     * @returns {Binding[]}
     */
    function parse(source) {
        let bindings = parsed.get(source);
        if (bindings) return bindings;
        bindings = [];
        for (const part of source.split(';')) {
            const colon = part.indexOf(':');
            if (colon < 0) continue;
            const directive = part.slice(0, colon).trim();
            let expr = part.slice(colon + 1).trim();
            const negate = expr[0] === '!';
            if (negate) expr = expr.slice(1).trim();
            let store = '';
            if (expr[0] === '$') {
                const dot = expr.indexOf('.');
                store = dot < 0 ? expr.slice(1) : expr.slice(1, dot);
                expr = dot < 0 ? '' : expr.slice(dot + 1);
            }
            bindings.push({ directive, path: expr ? expr.split('.') : [], negate, store });
        }
        parsed.set(source, bindings);
        return bindings;
    }

    /**
     * Reads the JSON a scope or store starts from: inline, or `#id` of a
     * `<script type="application/json">`.
     * @param {Element | null} el @param {string | null} value @param {string} what
     */
    function seed(el, value, what) {
        let json = value || '';
        if (json[0] === '#' && el) {
            const root = /** @type {Document | ShadowRoot} */ (el.getRootNode());
            json = root.getElementById?.(json.slice(1))?.textContent || '';
        }
        try {
            return json.trim() ? JSON.parse(json) : {};
        } catch (error) {
            throw new SyntaxError(`[CycleWire] ${what}: ${/** @type {Error} */ (error).message}`);
        }
    }

    /**
     * The reactive scope an element belongs to: the nearest
     * `cw-state` ancestor (the element itself included), created from its
     * JSON on first use. Undefined outside any scope.
     * @param {Element} el
     * @returns {any}
     */
    function stateOf(el) {
        const scope = el.closest(`[${attr('state')}]`);
        if (!scope) return undefined;
        let state = scopes.get(scope);
        if (!state) {
            state = reactive(seed(scope, scope.getAttribute(attr('state')), attr('state')));
            scopes.set(scope, state);
            const selector = `[${attr('bind')}]`;
            for (const node of [scope, ...scope.querySelectorAll(selector)]) {
                if (node.hasAttribute(attr('bind')) && node.closest(`[${attr('state')}]`) === scope) bind(node, '');
            }
        }
        return state;
    }

    /**
     * A named store shared by the whole page, seeded from
     * `<script type="application/json" cw-store="name">`. `init` adds
     * defaults and getters: JSON from the server wins over plain defaults,
     * getters (derived values) are always installed.
     * @param {string} name
     * @param {object} [init]
     * @returns {any}
     */
    function store(name, init) {
        let state = stores.get(name);
        if (!state) {
            const script = [...document.querySelectorAll(`script[type="application/json"][${attr('store')}="${CSS.escape(name)}"]`)].find((el) => !ignored(el)) || null;
            state = reactive(seed(script, script && script.textContent, `${attr('store')}="${name}"`));
            stores.set(name, state);
            if (init) define(state, init);
            const selector = `[${attr('bind')}*="$${name}"]`;
            roots.add(document);
            for (const root of roots) for (const el of root.querySelectorAll(selector)) bind(el, name);
        } else if (init) {
            define(state, init);
        }
        return state;
    }

    /** @param {any} state @param {object} init */
    function define(state, init) {
        const raw = toRaw(state);
        batch(() => {
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(init))) {
                if (key in raw && !descriptor.get) continue;
                Object.defineProperty(raw, key, { ...descriptor, configurable: true });
                trigger(raw, key);
            }
        });
    }

    /** @param {any} state @param {Binding} b */
    function read(state, b) {
        let value = state;
        for (const key of b.path) value = value == null ? undefined : value[key];
        return b.negate ? !value : value;
    }

    /**
     * @param {Element} el @param {string} directive @param {unknown} value
     */
    function apply(el, directive, value) {
        const node = /** @type {any} */ (el);
        if (directive === 'text') {
            const text = value == null ? '' : String(value);
            if (el.textContent !== text) el.textContent = text;
        } else if (directive === 'value' || directive === 'checked') {
            if (el === editing) return;
            if (directive === 'checked') node.checked = !!value;
            else if (node.type === 'radio') node.checked = String(value) === node.value;
            else {
                const text = value == null ? '' : String(value);
                if (node.value !== text) node.value = text;
            }
        } else if (directive === 'show' || directive === 'hide') {
            node.hidden = directive === 'show' ? !value : !!value;
        } else if (directive.startsWith('class.')) {
            el.classList.toggle(directive.slice(6), !!value);
        } else if (directive.startsWith('attr.')) {
            const name = directive.slice(5);
            if (value == null || value === false) {
                if (typeof value === 'boolean' && name.startsWith('aria-')) el.setAttribute(name, 'false');
                else el.removeAttribute(name);
            } else {
                const text = value === true ? (name.startsWith('aria-') ? 'true' : '') : String(value);
                // State is data. A binding never turns it into code: no event handlers, no
                // srcdoc, no script URLs.
                if (/^on|^srcdoc$/i.test(name) || (URL_ATTRS.test(name) && text.split(';').some((url) => UNSAFE_URL.test(url.replace(/[\x00-\x20\x7f]/g, ''))))) {
                    if (__DEV__) console.warn(`[CycleWire] Refusing to bind ${name} to ${JSON.stringify(text.slice(0, 40))}.`, el);
                } else if (el.getAttribute(name) !== text) el.setAttribute(name, text);
            }
        } else if (directive.startsWith('style.')) {
            node.style.setProperty(directive.slice(6), value == null || value === false ? '' : String(value));
        } else if (__DEV__) {
            console.warn(`[CycleWire] Unknown binding "${directive}".`, el);
        }
    }

    /**
     * Wires an element's bindings for one store ("" = its scope).
     * @param {Element} el @param {string} which
     */
    function bind(el, which) {
        if (ignored(el)) return;
        const bindings = parse(el.getAttribute(attr('bind')) || '');
        let done = bound.get(el);
        if (!done) bound.set(el, (done = new Set()));
        bindings.forEach((b, index) => {
            if (b.store !== which || done.has(index)) return;
            done.add(index);
            const state = b.store ? store(b.store) : stateOf(el);
            if (state === undefined) return;
            let first = true;
            /** @type {(() => void) | undefined} */
            let dispose;
            dispose = effect(() => {
                const value = read(state, b);
                // Stop updating elements that have left the page.
                if (!first && !el.isConnected) return dispose?.();
                first = false;
                apply(el, b.directive, value);
            });
        });
    }

    /** Two-way bindings: user input flows back into the state. @param {Event} event */
    function onInput(event) {
        const el = /** @type {HTMLInputElement} */ (event.composedPath()[0]);
        const source = el && el.getAttribute?.(attr('bind'));
        if (!source || ignored(el)) return;
        const textual = !/^(?:checkbox|radio|file|select-one|select-multiple)$/.test(el.type);
        const number = (el.type === 'number' || el.type === 'range') && !Number.isNaN(el.valueAsNumber);
        // Read before the scope wakes up: its first render must not clobber what was typed.
        const value = number ? el.valueAsNumber : el.value;
        const checked = el.checked;
        editing = el;
        try {
            for (const b of parse(source)) {
                if ((b.directive !== 'value' && b.directive !== 'checked') || b.negate || !b.path.length) continue;
                // Text fields sync on input, everything else on change.
                if ((event.type === 'input') !== (b.directive === 'value' && textual)) continue;
                if (el.type === 'radio' && !checked) continue;
                const state = b.store ? store(b.store) : stateOf(el);
                let target = state;
                for (const key of b.path.slice(0, -1)) target = target?.[key];
                if (target == null) continue;
                target[b.path[b.path.length - 1]] = b.directive === 'checked' ? checked : value;
            }
        } finally {
            editing = null;
        }
    }

    /**
     * The CycleWire plugin: two-way bindings, `ctx.state` / `ctx.store` in
     * actions, and binding of content added after a store came alive.
     * @param {{ prefix?: string }} [options]
     * @returns {import('./index.js').Plugin}
     */
    function signals(options = {}) {
        return {
            setup(info) {
                prefix = options.prefix ?? info.prefix;
                roots.add(document);
                document.addEventListener('input', onInput);
                document.addEventListener('change', onInput);
            },
            context(ctx) {
                Object.defineProperty(ctx, 'state', { get: () => stateOf(ctx.element), enumerable: true, configurable: true });
                ctx.store = store;
            },
            scan(root) {
                if (root instanceof ShadowRoot && !roots.has(root)) {
                    roots.add(root);
                    // change does not cross the shadow boundary.
                    root.addEventListener('change', onInput);
                }
                const selector = `[${attr('bind')}]`;
                const found = [.../** @type {ParentNode} */ (root).querySelectorAll(selector)];
                if (/** @type {Node} */ (root).nodeType === 1 && /** @type {Element} */ (root).matches(selector)) found.push(/** @type {Element} */ (root));
                for (const el of found) {
                    for (const b of parse(el.getAttribute(attr('bind')) || '')) {
                        if (b.store ? stores.has(b.store) : scopes.has(/** @type {Element} */ (el.closest(`[${attr('state')}]`)))) bind(el, b.store);
                    }
                }
            },
            stop() {
                document.removeEventListener('input', onInput);
                document.removeEventListener('change', onInput);
            },
        };
    }

    return { signal, computed, effect, batch, untracked, reactive, toRaw, stateOf, store, signals };
}

/**
 * One reactive graph per page, even when two copies of this module load
 * (say, from a CDN and from a bundle): the first copy's implementation wins.
 * @type {ReturnType<typeof create>}
 */
const shared = /** @type {any} */ (globalThis)[KEY] || (/** @type {any} */ (globalThis)[KEY] = create());

export const signal = shared.signal;
export const computed = shared.computed;
export const effect = shared.effect;
export const batch = shared.batch;
export const untracked = shared.untracked;
export const reactive = shared.reactive;
export const toRaw = shared.toRaw;
export const stateOf = shared.stateOf;
export const store = shared.store;
export const signals = shared.signals;
