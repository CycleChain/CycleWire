/**
 * cyclewire/devtools — an in-page inspector for pages that run CycleWire.
 *
 *   import { devtools } from 'cyclewire/devtools';
 *   start({ actions, plugins: [devtools()] });
 *
 * or on any such page, a production one included:
 *
 *   import('cyclewire/devtools').then(({ install }) => install());
 *
 * A panel lists the registered actions, every run, the development build's
 * trace, the triggers and scheduled preloads in the page, and the bindings of
 * any element you pick. It talks only to the public API, the `cw:*` events
 * and the DOM, never to the core's modules, so a bundled copy of CycleWire, a
 * CDN copy and an older version all work. Importing it does nothing by itself.
 */

/** @typedef {import('./index.js').Wire} Wire */
/** @typedef {import('./index.js').Plugin} Plugin */
/** @typedef {import('./types.js').TraceEvent} TraceEvent */

/**
 * @typedef {object} DevtoolsOptions
 * @property {boolean} [open]  start with the panel expanded
 * @property {Partial<Wire>} [wire]  the CycleWire API to inspect. Default: the copy that started on the page
 */

/**
 * @typedef {object} Run
 * @property {number} id
 * @property {string} action
 * @property {Element} el
 * @property {string} type    the event type; "" for triggers and run()
 * @property {string} mode
 * @property {number} t       performance.now() when it started
 * @property {number} ms      its duration once it ended
 * @property {string} status  running | done | aborted | error
 * @property {string} error
 * @property {boolean} stale  its row shows an older state
 * @property {HTMLTableRowElement} [row]
 */

/** @typedef {{ t: number, type: string, text: string, row?: HTMLLIElement }} Entry */

/**
 * The panel mounted on the page, shared by every copy of this module.
 * @typedef {object} Controller
 * @property {() => void} remove
 * @property {(open: boolean) => void} show
 * @property {(first?: boolean) => Plugin} plugin  hooks for one CycleWire; only the first one set up is heard
 * @property {(given?: Partial<Wire>) => void} find  connects to `given`, or to the CycleWire that starts on the page
 */

const G = /** @type {any} */ (globalThis);
const CORE = Symbol.for('cyclewire');
const PANEL = Symbol.for('cyclewire.devtools');
const LOG_MAX = 500;
const RUNS_MAX = 200;
const MODES = /^(?:drop|restart|latest|parallel)$/;
const LOG_TYPES = ['schedule', 'wait', 'preload', 'import', 'imported', 'skip', 'debounce', 'queue', 'start', 'end', 'cw:run', 'cw:done', 'cw:error'];
// Swallowed while picking, so the page sees no hover, press or click. Of the
// keys, only Escape and Enter are kept from the page.
const PICK_EVENTS = ['pointerover', 'pointerout', 'pointermove', 'pointerdown', 'pointerup', 'mouseover', 'mouseout', 'mousemove', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'focusin', 'keydown'];
const STATUS = /** @type {Record<string, string>} */ ({ running: 'running', done: 'done', aborted: 'aborted', error: 'failed' });

// `all: initial` keeps the page's inherited styles out, and `!important` in
// the shadow tree wins over any page rule aimed at the host element.
const STYLE = `
:host{all:initial!important;display:contents!important}
.cw{--bg:#fff;--fg:#1b1b1f;--mute:#5f5f6b;--line:#dcdce3;--ac:#5b5bd6;--bad:#c22525;--ok:#237a37;display:contents;color-scheme:light dark;font:12px/1.45 system-ui,sans-serif;color:var(--fg)}
@media (prefers-color-scheme:dark){.cw{--bg:#1c1c22;--fg:#ececf1;--mute:#a5a5b0;--line:#3a3a45;--ac:#a5a5f9;--bad:#ff8c8c;--ok:#80d492}}
*{box-sizing:border-box}
#layer,#toggle,#panel{position:fixed;z-index:2147483647}
#layer{top:0;left:0;pointer-events:none}
.box{position:absolute;border:2px solid #5b5bd6;background:rgba(91,91,214,.15);border-radius:3px}
.box span{position:absolute;left:-2px;bottom:100%;padding:0 4px;background:#5b5bd6;color:#fff;font:11px/16px ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
.box.pick{border-color:#c2410c;background:rgba(194,65,12,.15)}
.pick span{background:#c2410c}
#toggle{right:12px;bottom:12px;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:var(--ac);color:var(--bg);font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3)}
#panel{right:12px;bottom:56px;width:min(580px,calc(100vw - 24px));height:min(440px,calc(100vh - 72px));display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.3);overflow:hidden;animation:rise .12s ease-out}
#panel[hidden]{display:none}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
@media (prefers-reduced-motion:reduce){#panel{animation:none}}
header,.bar{display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--bg)}
.bar{position:sticky;top:0}
#status{flex:1}
#status,#version,thead th,.note,dt{color:var(--mute)}
[role=tablist]{display:flex;border-bottom:1px solid var(--line)}
button,select{font:inherit;color:inherit;background:none;border:1px solid var(--line);border-radius:4px;padding:1px 6px;cursor:pointer}
[role=tab]{border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 10px;color:var(--mute)}
[role=tab][aria-selected=true]{color:var(--fg);border-color:var(--ac)}
[aria-pressed=true]{background:var(--ac);border-color:var(--ac);color:var(--bg)}
:focus-visible{outline:2px solid var(--ac);outline-offset:-2px}
[role=tabpanel]{flex:1;min-height:0;overflow:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:3px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
thead th{position:sticky;top:0;background:var(--bg);font-weight:600}
td button{margin-right:4px}
ol{margin:0;padding:0;list-style:none}
li{padding:1px 10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
ol,pre{font:11px/1.5 ui-monospace,Menlo,Consolas,monospace}
.note{margin:8px 10px}
.bad{color:var(--bad)}
.ok{color:var(--ok)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:8px 10px}
dd{margin:0;overflow-wrap:anywhere}
pre{margin:0;white-space:pre-wrap}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

/**
 * A new element. The panel is built from these alone, never from HTML, so page
 * strings never become markup and pages that enforce Trusted Types allow it.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]  properties, or attributes for `role` and names with a dash
 * @param {...(Node | string)} children  nodes, or plain text
 * @returns {HTMLElementTagNameMap[K]}
 */
function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const key in props) {
        if (key === 'role' || key.includes('-')) el.setAttribute(key, props[key]);
        else /** @type {any} */ (el)[key] = props[key];
    }
    el.append(...children);
    return el;
}

/** @param {Element | null | undefined} el e.g. `button#buy.btn.primary` */
const describe = (el) => (el ? el.localName + (el.id ? `#${el.id}` : '') + [...el.classList].slice(0, 2).map((name) => `.${name}`).join('') : '');

/** @param {unknown} error */
function text(error) {
    try {
        return String(/** @type {any} */ (error)?.message || error);
    } catch {
        return 'error';
    }
}

/** @param {string} action `module#export` → `module` */
const moduleOf = (action) => action.split('#')[0];

/** @param {Run} run */
const took = (run) => (run.status === 'running' ? '…' : `${run.ms < 10 ? run.ms.toFixed(1) : Math.round(run.ms)} ms`);

/** The event a bare action attribute listens for, as the core decides it. @param {Element} el */
function natural(el) {
    const name = el.localName;
    const type = /** @type {HTMLInputElement} */ (el).type;
    if (name !== 'input') return /** @type {Record<string, string>} */ ({ form: 'submit', select: 'change', textarea: 'input', details: 'toggle' })[name] || 'click';
    return /^(?:button|submit|reset|image)$/.test(type) ? 'click' : /^(?:checkbox|radio|file|range|color|date|datetime-local|month|week|time)$/.test(type) ? 'change' : 'input';
}

/**
 * Mounts the panel, hidden unless `options.open`.
 * @param {DevtoolsOptions} options
 * @returns {Controller}
 */
function mount(options) {
    let prefix = 'cw-';
    /** @type {Partial<Wire> | null} */
    let wire = null;
    /** The hooks CycleWire calls; hooks added later stay silent. @type {Plugin | null} */
    let source = null;
    let live = true;
    let open = false;
    let picking = false;
    let traced = false;
    let paused = false;
    let tab = 0;
    let ids = 0;
    let news = 0;
    let fails = 0;
    let shown = '';
    let timer = /** @type {any} */ (0);
    let speaking = /** @type {any} */ (0);
    let polling = /** @type {any} */ (0);
    let raf = 0;
    /** @type {Element | null} */
    let picked = null;
    /** @type {Element | null} */
    let hovered = null;
    /** @type {Element | null} */
    let returnTo = null;
    /** @type {Run[]} */
    const runs = [];
    /** @type {Entry[]} */
    const log = [];
    /** Runs and errors per module. @type {Map<string, { runs: number, errors: number }>} */
    const stats = new Map();
    /** @type {WeakMap<object, Run>} */
    const traceRuns = new WeakMap();
    /** Elements whose trigger fired. @type {WeakSet<Element>} */
    const fired = new WeakSet();
    /** Elements whose trigger fired before its action was registered. @type {WeakSet<Element>} */
    const waiting = new WeakSet();
    /** Elements whose trigger or preload the trace saw being set up. @type {WeakSet<Element>} */
    const scheduled = new WeakSet();
    /** Whether the panel was set up by start(), and so has seen every trigger fire. */
    let early = false;
    /** Modules fetched ahead of use. @type {Set<string>} */
    const fetched = new Set();
    /** @type {Map<HTMLElement, Element>} */
    const boxes = new Map();
    /** @type {WeakMap<Element, number>} */
    const numbers = new WeakMap();
    /** @type {(() => void)[]} */
    const cleanup = [];

    /** @param {string} name */
    const at = (name) => `data-${prefix}${name}`;

    /**
     * Errors in the panel must never reach the page or the core that called a hook.
     * @template {any[]} A
     * @param {(...args: A) => unknown} fn
     * @returns {(...args: A) => void}
     */
    const guard = (fn) => (...args) => {
        try {
            if (live) fn(...args);
        } catch (error) {
            console.warn('[CycleWire devtools]', error);
        }
    };

    /** @param {EventTarget} target @param {string} type @param {(event: any) => unknown} fn @param {boolean} [capture] */
    const on = (target, type, fn, capture = false) => {
        const listener = guard(fn);
        target.addEventListener(type, listener, capture);
        cleanup.push(() => target.removeEventListener(type, listener, capture));
    };

    const host = document.createElement('cyclewire-devtools');
    const shadow = host.attachShadow({ mode: 'open' });
    try {
        // An adopted stylesheet, which a strict style-src still allows.
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(STYLE);
        shadow.adoptedStyleSheets = [sheet];
    } catch {
        shadow.append(h('style', {}, STYLE));
    }
    /** @param {string} id */
    const $ = (id) => /** @type {HTMLElement} */ (shadow.getElementById(id));
    /** @param {string} id @param {...(Node | string)} headers */
    const table = (id, ...headers) => h('table', {}, h('thead', {}, h('tr', {}, ...headers.map((header) => h('th', {}, header)))), h('tbody', { id }));
    const layer = h('div', { id: 'layer', 'aria-hidden': 'true' });
    const toggle = h('button', { id: 'toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'panel', 'aria-label': 'CycleWire devtools', 'aria-keyshortcuts': 'Alt+Shift+W', title: 'CycleWire devtools (Alt+Shift+W)' }, 'CW');
    const version = h('span', { id: 'version' });
    const status = h('span', { id: 'status', role: 'status' });
    const pick = h('button', { type: 'button', 'aria-pressed': 'false', title: 'Pick an element in the page (Esc stops)' }, 'Inspect');
    const tabs = ['Actions', 'Runs', 'Log', 'Triggers', 'Element'].map((name, i) => h('button', { type: 'button', role: 'tab', id: `t${i}`, 'aria-controls': `p${i}`, 'aria-selected': String(!i), tabIndex: i ? -1 : 0 }, name));
    const tablist = h('div', { role: 'tablist', 'aria-label': 'Views' }, ...tabs);
    const filter = h('select', { id: 'filter' }, new Option('everything', ''), ...LOG_TYPES.map((type) => new Option(type)));
    const pause = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Pause');
    const clear = h('button', { type: 'button' }, 'Clear');
    const untraced = h('p', { id: 'untraced', className: 'note' }, 'No trace events so far: only the development build reports what CycleWire schedules, fetches and skips. The cw:* events show with every build.');
    const noRuns = h('p', { className: 'note' }, 'No runs yet.');
    const list = h('ol', { id: 'log' });
    const panes = [
        [table('actions', 'Action', 'Loaded', 'Elements', 'Runs', 'Errors', h('span', { className: 'sr' }, 'Tools'))],
        [table('runs', 'Action', 'Element', 'Event', 'Mode', 'Time', 'Status'), noRuns],
        [h('div', { className: 'bar' }, h('label', {}, 'Show ', filter), pause, clear), untraced, list],
        [table('triggers', 'Element', 'Kind', 'Waits for', 'Actions', 'State')],
        [h('div', { id: 'element' })],
    ].map((content, i) => h('div', { role: 'tabpanel', id: `p${i}`, 'aria-labelledby': `t${i}`, tabIndex: 0, hidden: i > 0 }, ...content));
    const liveRegion = h('p', { className: 'sr', 'aria-live': 'polite' });
    const panel = h('section', { id: 'panel', 'aria-label': 'CycleWire devtools', hidden: true }, h('header', {}, h('b', {}, 'CycleWire'), version, status, pick), tablist, ...panes, liveRegion);
    shadow.append(h('div', { className: 'cw' }, layer, toggle, panel));

    // ------------------------------------------------------------ records

    /** @param {string} action */
    function stat(action) {
        const name = moduleOf(action);
        let found = stats.get(name);
        if (!found) stats.set(name, (found = { runs: 0, errors: 0 }));
        return found;
    }

    /** @param {object | null} key @param {Element} el @param {string} action @param {string} type @param {string} mode */
    function begin(key, el, action, type, mode) {
        /** @type {Run} */
        const run = { id: ++ids, action, el, type, mode, t: performance.now(), ms: 0, status: 'running', error: '', stale: true };
        if (key) traceRuns.set(key, run);
        if (!type) fired.add(el);
        runs.push(run);
        if (runs.length > RUNS_MAX) runs.shift()?.row?.remove();
        stat(action).runs++;
        dirty();
    }

    /** @param {Run | undefined} run @param {string} status @param {unknown} [error] */
    function finish(run, status, error) {
        if (!run || run.status !== 'running') return;
        run.status = status;
        run.ms = performance.now() - run.t;
        run.stale = true;
        if (status === 'error') {
            run.error = text(error);
            stat(run.action).errors++;
        }
        announce(status === 'error');
        dirty();
    }

    /** @param {string} type @param {Element | null | undefined} el @param {string} detail */
    function note(type, el, detail) {
        if (paused) return;
        log.push({ t: performance.now(), type, text: `${detail} ${describe(el)}`.trim() });
        if (log.length > LOG_MAX) log.shift()?.row?.remove();
        dirty();
    }

    /** Tells screen readers about ended runs, at most every three seconds. @param {boolean} failed */
    function announce(failed) {
        if (!open) return;
        news++;
        if (failed) fails++;
        speaking ||= setTimeout(guard(() => {
            liveRegion.textContent = `${news} run${news > 1 ? 's' : ''} ended${fails ? `, ${fails} failed` : ''}`;
            news = fails = speaking = 0;
        }), 3000);
    }

    /** @param {TraceEvent} event */
    function onTrace(event) {
        traced = true;
        const any = /** @type {any} */ (event);
        let el = any.element;
        let detail = [any.action || any.name, any.kind, any.when, any.reason, any.mode, any.cached && 'cached', any.wait && `${any.wait} ms`].filter(Boolean).join(' ');
        if (event.type === 'start') begin(event.run, event.element, event.action, event.event ? event.event.type : '', event.mode);
        else if (event.type === 'end') {
            const run = traceRuns.get(event.run);
            finish(run, event.status, any.error);
            el = event.run.el;
            detail = `${run ? `${run.action} ` : ''}${event.status}${any.error ? ` ${text(any.error)}` : ''}${run ? ` ${took(run)}` : ''}`;
        } else if (event.type === 'wait') waiting.add(event.element);
        else if (event.type === 'schedule') scheduled.add(event.element);
        else if (event.type === 'preload') fetched.add(event.name);
        else if (event.type === 'imported') {
            if (event.ok) fetched.add(event.name);
            else detail += ` failed ${text(event.error)}`;
        }
        note(event.type, el, detail);
    }

    /**
     * Without a trace (the production build, or before the hooks are in),
     * runs come from `cw:run`, which also fires for runs the core then drops,
     * skips or supersedes. This follows the core's rules to tell them apart.
     * @param {Element} el @param {string} action @param {Event | null} event
     */
    function guess(el, action, event) {
        const type = event ? event.type : '';
        const mode = modeOf(el, type);
        const wait = Number(el.getAttribute(at('debounce'))) || 0;
        const same = runs.filter((run) => run.el === el && run.action === action);
        if (el.hasAttribute(at('once')) && same.some((run) => run.status === 'done')) return;
        /** @type {Run[]} */
        const busy = [];
        for (const run of same) {
            if (run.status !== 'running') continue;
            // Still inside its debounce wait, it never started: this event replaces it.
            if (performance.now() - run.t < wait) {
                runs.splice(runs.indexOf(run), 1);
                run.row?.remove();
                stat(action).runs--;
            } else busy.push(run);
        }
        if (busy.length && mode === 'drop') return;
        if (mode === 'restart') busy.forEach((run) => finish(run, 'aborted'));
        // `latest` holds one event back; a newer one replaces it.
        if (mode === 'latest' && busy.length > 1) finish(busy[busy.length - 1], 'aborted');
        begin(null, el, action, type, mode);
    }

    /** @param {CustomEvent} event */
    function onLifecycle(event) {
        const el = /** @type {Element} */ (event.composedPath()[0]);
        const { action, event: cause, error } = event.detail || {};
        note(event.type, el, `${action}${error ? ` ${text(error)}` : ''}`);
        if (event.type === 'cw:run') {
            if (!cause) fired.add(el);
            // A listener may still cancel it; the trace, when there is one, arrives meanwhile.
            queueMicrotask(guard(() => traced || event.defaultPrevented || guess(el, action, cause)));
        } else if (!traced) {
            finish(runs.find((run) => run.status === 'running' && run.el === el && run.action === action), event.type === 'cw:done' ? 'done' : 'error', error);
        }
    }

    // ------------------------------------------------------------ the page

    /** [event, action] for every action bound on an element. @param {Element} el @returns {[string, string][]} */
    function bindings(el) {
        /** @type {[string, string][]} */
        const found = [];
        const onAttr = at('on-');
        for (const name of el.getAttributeNames()) {
            const value = (name === at('action') || name.startsWith(onAttr)) && el.getAttribute(name)?.trim();
            if (value) found.push([name === at('action') ? (el.hasAttribute(at('trigger')) ? 'trigger' : natural(el)) : name.slice(onAttr.length), value]);
        }
        return found;
    }

    /** The concurrency mode a run gets, as the core decides it. @param {Element} el @param {string} type */
    function modeOf(el, type) {
        if (el.hasAttribute(at('once'))) return 'drop';
        const own = el.getAttribute(at('concurrency'));
        if (own && MODES.test(own)) return own;
        return !type || /^(?:click|submit|command)$/.test(type) ? 'drop' : type === 'input' ? 'restart' : /^(?:change|toggle)$/.test(type) ? 'latest' : 'parallel';
    }

    /** Whether an element sits inside the ignore attribute, across shadow roots. @param {Element} el */
    function ignored(el) {
        for (let node = /** @type {any} */ (el); node; node = node.parentNode || node.host) {
            if (node.nodeType === 1 && node.hasAttribute(at('ignore'))) return true;
        }
        return false;
    }

    /** Elements that bind actions or wait for a trigger or preload, open shadow roots included. */
    function inventory() {
        /** @type {[Element, [string, string][]][]} */
        const found = [];
        /** @param {ParentNode} root */
        const walk = (root) => {
            for (const el of root.querySelectorAll('*')) {
                if (el === host) continue;
                const bound = bindings(el);
                if (bound.length || el.hasAttribute(at('trigger')) || el.hasAttribute(at('preload'))) found.push([el, bound]);
                if (el.shadowRoot) walk(el.shadowRoot);
            }
        };
        walk(document);
        return found;
    }

    // ------------------------------------------------------------ outlines

    /** @param {Element[]} els @param {string} kind "" or "pick" */
    function outline(els, kind) {
        for (const box of boxes.keys()) box.remove();
        boxes.clear();
        for (const el of els.slice(0, 100)) {
            const box = h('div', { className: `box ${kind}` }, h('span', {}, describe(el)));
            boxes.set(box, el);
            layer.append(box);
        }
        cancelAnimationFrame(raf);
        place();
    }

    /** Keeps the outlines on their elements while anything moves. */
    const place = guard(() => {
        raf = 0;
        for (const [box, el] of boxes) {
            const { left, top, width, height } = el.getBoundingClientRect();
            box.hidden = !el.isConnected;
            // Style properties rather than a style attribute, which a strict CSP blocks.
            Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        }
        if (boxes.size) raf = requestAnimationFrame(place);
    });

    /** Outlines elements, or removes the outline when the same key asks again. @param {string} key @param {Element[]} els */
    function spotlight(key, els) {
        shown = shown === key ? '' : key;
        outline(shown ? els : [], '');
        if (shown) {
            if (els[0]) els[0].scrollIntoView({ block: 'nearest' });
            else liveRegion.textContent = 'No elements to outline';
        }
        dirty();
    }

    // ------------------------------------------------------------ picking

    /** @param {Event} event */
    const onPick = guard((event) => {
        const path = /** @type {Element[]} */ (event.composedPath());
        if (path.includes(host)) return;
        const type = event.type;
        if (type === 'keydown') {
            const key = /** @type {KeyboardEvent} */ (event).key;
            if (key === 'Escape') picker(false);
            else if (key === 'Enter' && hovered) choose(hovered);
            else return;
        } else {
            // The bound element rather than the text or icon inside it.
            const target = path.find((node) => node.nodeType === 1 && (bindings(node).length || node.hasAttribute(at('trigger')))) || path[0];
            if (type === 'click') choose(target);
            else if (/over|move|focusin/.test(type) && target !== hovered && target.nodeType === 1) {
                hovered = target;
                outline([target], 'pick');
            }
        }
        // Pointer events stay uncancelled: cancelling pointerdown would not stop the click.
        if (!/^pointer|^mouse(?:over|out|move)/.test(type)) event.preventDefault();
        event.stopImmediatePropagation();
    });

    /** @param {boolean} value */
    function picker(value) {
        if (value === picking) return;
        picking = value;
        shown = '';
        pick.setAttribute('aria-pressed', String(value));
        for (const type of PICK_EVENTS) (value ? addEventListener : removeEventListener)(type, onPick, true);
        hovered = null;
        if (value) liveRegion.textContent = 'Pick an element: click it, or focus it and press Enter. Escape stops.';
        else outline([], '');
    }

    /** @param {Element} el */
    function choose(el) {
        picked = el;
        picker(false);
        select(4, true);
    }

    // ------------------------------------------------------------ rendering

    const dirty = () => {
        timer ||= setTimeout(guard(render), 150);
    };

    function render() {
        timer = 0;
        if (open) [actionsTab, runsTab, logTab, triggersTab, elementTab][tab]();
    }

    /** A stable number per element, so a list notices when its elements change. @param {Element} el */
    function numberOf(el) {
        let number = numbers.get(el);
        if (!number) numbers.set(el, (number = ++ids));
        return number;
    }

    /**
     * Replaces a list's rows, keeping focus on the control that had it. Rows
     * that would look the same stay, so a click or a selection survives.
     * @param {string} id @param {Node[]} rows @param {number} columns @param {string} empty
     * @param {string} [extra] what else the rows depend on
     */
    function fill(id, rows, columns, empty, extra = '') {
        const box = /** @type {HTMLElement & { sig?: string }} */ ($(id));
        if (!rows.length) rows = [h('tr', {}, h('td', { colSpan: columns, className: 'note' }, empty))];
        const sig = shown + extra + rows.map((row) => row.textContent).join('\n');
        if (box.sig === sig) return;
        box.sig = sig;
        const key = /** @type {HTMLElement | null} */ (shadow.activeElement)?.dataset?.k;
        box.replaceChildren(...rows);
        for (const el of box.querySelectorAll('[data-k]')) if (key && /** @type {HTMLElement} */ (el).dataset.k === key) /** @type {HTMLElement} */ (el).focus();
    }

    /**
     * @param {string} key @param {string} label @param {string} name
     * @param {() => unknown} action @param {boolean} [pressed]
     */
    const button = (key, label, name, action, pressed) => h('button', { type: 'button', 'data-k': key, 'aria-label': name, onclick: guard(action), ...(pressed === undefined ? {} : { 'aria-pressed': String(pressed) }) }, label);

    function actionsTab() {
        const registered = wire?.registered?.();
        const known = registered && new Set(registered);
        const loaded = wire?.loaded?.() || [];
        /** @type {Map<string, Element[]>} */
        const users = new Map();
        for (const [el, bound] of inventory()) {
            for (const name of new Set(bound.map(([, action]) => moduleOf(action)))) {
                if (!users.has(name)) users.set(name, []);
                users.get(name)?.push(el);
            }
        }
        const names = new Set([...(registered || []), ...loaded, ...users.keys(), ...stats.keys()]);
        fill('actions', [...names].map((name) => {
            const { runs: count = 0, errors = 0 } = stats.get(name) || {};
            const els = users.get(name) || [];
            const missing = known && !known.has(name);
            return h('tr', {},
                h('th', { scope: 'row' }, name, missing ? h('span', { className: 'bad' }, ' not registered') : ''),
                h('td', {}, loaded.includes(name) ? 'yes' : fetched.has(name) ? 'fetched' : 'no'),
                h('td', {}, String(els.length)),
                h('td', {}, String(count)),
                h('td', { className: errors ? 'bad' : '' }, String(errors)),
                h('td', {},
                    wire?.preload && !missing ? button(`p${name}`, 'Preload', `Preload ${name}`, () => wire?.preload?.(name).then(guard(() => {
                        fetched.add(name);
                        dirty();
                    }))) : '',
                    button(`o${name}`, 'Outline', `Outline the elements of ${name}`, () => spotlight(`a${name}`, inventory().filter(([, bound]) => bound.some(([, action]) => moduleOf(action) === name)).map(([el]) => el)), shown === `a${name}`)));
        }), 6, 'No actions registered or bound in the page.');
    }

    function runsTab() {
        const body = $('runs');
        for (const run of runs) {
            if (!run.row) {
                const cell = () => h('td');
                run.row = h('tr', { onclick: guard(() => spotlight(`r${run.id}`, [run.el])) },
                    h('td', {}, h('button', { type: 'button', 'aria-label': `${run.action}: outline ${describe(run.el)}` }, run.action)),
                    h('td', {}, describe(run.el)), h('td', {}, run.type || '–'), h('td', {}, run.mode), cell(), cell());
                body.prepend(run.row);
            }
            if (run.stale) {
                const cells = run.row.cells;
                cells[4].textContent = took(run);
                cells[5].textContent = run.status === 'error' ? `failed: ${run.error}` : STATUS[run.status];
                cells[5].className = run.status === 'error' ? 'bad' : run.status === 'done' ? 'ok' : '';
                cells[5].title = run.error;
                run.stale = false;
            }
        }
        noRuns.hidden = runs.length > 0;
    }

    function logTab() {
        const pane = panes[2];
        const end = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 8;
        const type = filter.value;
        for (const entry of log) {
            if (entry.row || (type && entry.type !== type)) continue;
            list.append(entry.row = h('li', {}, h('span', { className: 'note' }, (entry.t / 1000).toFixed(3)), ' ', h('b', {}, entry.type), ` ${entry.text}`));
        }
        untraced.hidden = traced;
        if (end) pane.scrollTop = pane.scrollHeight;
    }

    function triggersTab() {
        const registered = wire?.registered?.();
        const loaded = wire?.loaded?.() || [];
        /** @param {string} name */
        const ready = (name) => loaded.includes(name) || fetched.has(name);
        /** @type {HTMLTableRowElement[]} */
        const rows = [];
        /** @type {Element[]} */
        const elements = [];
        for (const [el, bound] of inventory()) {
            const actions = bound.map(([, action]) => action);
            for (const kind of ['trigger', 'preload']) {
                const when = el.getAttribute(at(kind))?.trim();
                if (!when || (kind === 'preload' && /^(?:intent|none)$/.test(when))) continue;
                // What fired before the panel was set up is unknown, except
                // `load`, which fires as soon as CycleWire sees the element.
                const seen = early || scheduled.has(el) ? 'waiting' : 'not seen';
                const state = ignored(el) ? 'ignored'
                    : kind === 'preload' ? (actions.length && actions.every((action) => ready(moduleOf(action))) ? 'fetched' : seen)
                        : fired.has(el) ? 'fired'
                            : waiting.has(el) || (registered && actions.some((action) => !registered.includes(moduleOf(action)))) ? 'waiting for register()'
                                : when === 'load' ? 'fired' : seen;
                const key = `t${rows.length}`;
                elements.push(el);
                rows.push(h('tr', {},
                    h('td', {}, button(key, describe(el), `Outline ${describe(el)}`, () => spotlight(key, [el]))),
                    h('td', {}, kind), h('td', {}, when), h('td', {}, actions.join(' ') || '–'),
                    h('td', { className: state === 'fired' || state === 'fetched' ? 'ok' : '' }, state)));
            }
        }
        fill('triggers', rows, 5, 'No triggers or scheduled preloads in the page.', elements.map(numberOf).join());
    }

    function elementTab() {
        const el = picked;
        if (!el) return fill('element', [h('p', { className: 'note' }, 'Press Inspect, then pick an element in the page.')], 0, '');
        const registered = wire?.registered?.();
        /** @type {Node[]} */
        const rows = [];
        /** @param {string} label @param {...(Node | string)} value */
        const row = (label, ...value) => rows.push(h('dt', {}, label), h('dd', {}, ...value));
        /** @param {string} name */
        const attr = (name) => el.getAttribute(at(name));
        const bound = bindings(el);
        const raw = attr('props');
        let props = 'none';
        let invalid = false;
        // As the core reads it: an empty attribute means no props.
        if (raw) {
            try {
                props = JSON.stringify(JSON.parse(raw), null, 2);
            } catch (error) {
                props = `Invalid JSON: ${text(error)}`;
                invalid = true;
            }
        }
        const prevent = attr('prevent');
        const debounce = Number(attr('debounce')) || 0;
        const own = runs.filter((run) => run.el === el).reverse();
        row('Element', `${describe(el)}${el.isConnected ? '' : ' (removed)'} `, button('e', 'Outline', `Outline ${describe(el)}`, () => spotlight('e', [el]), shown === 'e'));
        row('Actions', ...(bound.length ? bound.map(([type, action]) => h('div', {}, `${type} → ${action} (${modeOf(el, type === 'trigger' ? '' : type)})${registered && !registered.includes(moduleOf(action)) ? ' not registered' : ''}`)) : ['none']));
        row('Trigger', attr('trigger') || 'none');
        row('Preload', attr('preload') || 'intent');
        row('Props', h('pre', { className: invalid ? 'bad' : '' }, props));
        row('Concurrency', attr('concurrency') || 'default');
        row('Once', el.hasAttribute(at('once')) ? 'yes' : 'no');
        row('Debounce', debounce > 0 ? `${debounce} ms` : 'none');
        row('Prevent', prevent === null ? 'default' : prevent.trim() || 'every bound event');
        row('Pending', el.hasAttribute(at('pending')) ? 'yes' : 'no');
        row(`Inside ${at('ignore')}`, ignored(el) ? 'yes' : 'no');
        row('Runs', ...(own.length ? own.slice(0, 20).map((run) => h('div', {}, `${run.action} ${run.type || '–'} ${took(run)} ${run.status === 'error' ? `failed: ${run.error}` : STATUS[run.status]}`)) : ['none']));
        fill('element', [h('dl', {}, ...rows)], 0, '', String(numberOf(el)));
    }

    // ------------------------------------------------------------ panel

    /** @param {number} index @param {boolean} [focus] */
    function select(index, focus) {
        tab = (index + tabs.length) % tabs.length;
        tabs.forEach((el, i) => {
            el.setAttribute('aria-selected', String(i === tab));
            el.tabIndex = i === tab ? 0 : -1;
            panes[i].hidden = i !== tab;
        });
        if (focus) tabs[tab].focus();
        render();
    }

    /** @param {boolean} value @param {boolean} [focus] move focus into the panel, or back where it was */
    function show(value, focus) {
        if (value === open) return;
        const inside = panel.contains(shadow.activeElement);
        open = value;
        panel.hidden = !value;
        toggle.setAttribute('aria-expanded', String(value));
        if (value) {
            if (focus) {
                returnTo = document.activeElement;
                while (returnTo?.shadowRoot?.activeElement) returnTo = returnTo.shadowRoot.activeElement;
                tabs[tab].focus();
            }
            render();
        } else {
            picker(false);
            shown = '';
            outline([], '');
            if (inside) {
                /** @type {HTMLElement | null} */ (returnTo)?.focus?.();
                if (!returnTo?.isConnected || document.activeElement === host) toggle.focus();
            }
            returnTo = null;
        }
    }

    toggle.onclick = guard(() => show(!open));
    pick.onclick = guard(() => picker(!picking));
    tablist.onclick = guard((event) => {
        const index = tabs.indexOf(/** @type {HTMLButtonElement} */ (event.target));
        if (index >= 0) select(index, true);
    });
    tablist.onkeydown = guard((event) => {
        const index = /** @type {Record<string, number>} */ ({ ArrowRight: tab + 1, ArrowLeft: tab - 1, Home: 0, End: 4 })[event.key];
        if (index === undefined) return;
        event.preventDefault();
        select(index, true);
    });
    shadow.addEventListener('keydown', guard((/** @type {any} */ event) => {
        if (event.key !== 'Escape' || !open) return;
        event.stopPropagation();
        if (picking) picker(false);
        else show(false, true);
    }));
    filter.onchange = guard(() => {
        for (const entry of log) entry.row = undefined;
        list.replaceChildren();
        logTab();
    });
    pause.onclick = guard(() => pause.setAttribute('aria-pressed', String(paused = !paused)));
    clear.onclick = guard(() => {
        log.length = 0;
        list.replaceChildren();
    });

    on(window, 'keydown', (/** @type {KeyboardEvent} */ event) => {
        // By key position, since Alt changes the character on macOS; by character for other layouts.
        if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || (event.code !== 'KeyW' && event.key !== 'W')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        show(!open, true);
    }, true);
    // Capture, so a page that stops these events still shows up here.
    for (const type of ['cw:run', 'cw:done', 'cw:error']) on(document, type, onLifecycle, true);

    // ------------------------------------------------------------ CycleWire

    /** @param {Partial<Wire>} found @param {string} givenPrefix */
    function connect(found, givenPrefix) {
        wire = found;
        prefix = givenPrefix;
        // CycleWire then ignores events inside the panel, even with bindings on <html>.
        host.setAttribute(at('ignore'), '');
        clearInterval(polling);
        status.textContent = '';
        version.textContent = found.version || '';
        dirty();
    }

    /** @param {boolean} [first] set up by start(), before it activates the page @returns {Plugin} */
    function plugin(first) {
        /** @type {Plugin} */
        const hooks = {
            setup: guard((info) => {
                if (source) return;
                source = hooks;
                early = !!first;
                connect(info.wire, info.prefix);
            }),
            // With `shadow: true`, CycleWire also scans the panel's own open shadow root.
            scan: guard((root) => {
                if (source !== hooks || shadow.contains(/** @type {Node} */ (root))) return;
                status.textContent = '';
                dirty();
            }),
            trace: guard((event) => source === hooks && onTrace(event)),
            stop: guard(() => {
                if (source === hooks) status.textContent = 'CycleWire stopped';
            }),
        };
        return hooks;
    }

    /** @param {Partial<Wire>} found */
    function attach(found) {
        const hooks = plugin();
        found.use?.(hooks);
        // Without use(), registered() and loaded() still answer.
        if (!source) {
            source = hooks;
            connect(found, prefix);
        }
    }

    /**
     * Connects to `given`, or to the CycleWire that starts on the page: now,
     * on DOMContentLoaded, on load, then every 250 ms for ten seconds.
     * @param {Partial<Wire>} [given]
     */
    function find(given) {
        const look = () => {
            const found = given || G[CORE];
            if (found && !source) attach(found);
            return !!source;
        };
        if (look()) return;
        status.textContent = 'Waiting for CycleWire to start';
        const poll = () => {
            let tries = 0;
            polling = setInterval(guard(() => {
                if (look() || ++tries < 40) return;
                clearInterval(polling);
                // A copy that never started, or stopped, still has an API to read.
                if (G.CycleWire) attach(G.CycleWire);
                else status.textContent = 'CycleWire not found';
            }), 250);
        };
        if (document.readyState === 'complete') poll();
        else {
            on(document, 'DOMContentLoaded', look);
            on(window, 'load', () => look() || poll());
        }
    }

    function remove() {
        if (!live) return;
        show(false, true);
        live = false;
        for (const undo of cleanup) undo();
        clearTimeout(timer);
        clearTimeout(speaking);
        clearInterval(polling);
        cancelAnimationFrame(raf);
        host.remove();
        if (G[PANEL] === controller) delete G[PANEL];
    }

    /** @type {Controller} */
    const controller = { remove, show: (value) => show(value), plugin, find };
    G[PANEL] = controller;
    document.documentElement.append(host);
    if (options.open) show(true);
    return controller;
}

/**
 * Mounts the devtools panel on the page and connects it to CycleWire, waiting
 * for CycleWire to start if it has not yet. Calling it again returns the same
 * panel's remover.
 * @param {DevtoolsOptions} [options]
 * @returns {() => void} removes the panel and every listener it added
 */
export function install(options = {}) {
    /** @type {Controller | undefined} */
    const mounted = G[PANEL];
    if (mounted) {
        if (options.open) mounted.show(true);
        return mounted.remove;
    }
    const controller = mount(options);
    controller.find(options.wire);
    return controller.remove;
}

/**
 * The devtools panel as a plugin: `start({ plugins: [devtools()] })`.
 * @param {DevtoolsOptions} [options]
 * @returns {Plugin}
 */
export function devtools(options = {}) {
    /** @type {Plugin | undefined} */
    let hooks;
    return {
        setup(info) {
            hooks = /** @type {Controller} */ (G[PANEL] || mount(options)).plugin(true);
            hooks.setup?.(info);
        },
        scan: (root) => hooks?.scan?.(root),
        trace: (event) => hooks?.trace?.(event),
        stop: () => hooks?.stop?.(),
    };
}
