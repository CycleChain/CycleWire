/**
 * Types that JSDoc cannot express: the generic handler context, and the
 * action names and props that `cyclewire types` and the Vite plugin generate.
 * scripts/types.js copies this file next to the declarations tsc emits.
 */
import type { Wire } from './index.js';

declare global {
    /**
     * Every action by name, mapped to its handler. Empty until names are
     * generated, and then `ActionName` is their union and `PropsOf` reads
     * each handler's props. A generated file adds them:
     *
     *     interface CycleWireActions {
     *         'cart#add': typeof import('./actions/cart.js').add;
     *     }
     */
    interface CycleWireActions {}
}

/** An action name, `module` or `module#export`. Any string until names are generated. */
export type ActionName = [keyof CycleWireActions] extends [never] ? string : Extract<keyof CycleWireActions, string>;

/** The props an action's handler expects, as written in its `defineAction<Props>()`. */
export type PropsOf<N extends string> = N extends keyof CycleWireActions
    ? CycleWireActions[N] extends (context: Context<infer P, any>) => unknown ? P : unknown
    : any;

/** What every action handler receives. */
export interface Context<P = any, E extends Element = Element> {
    /** The triggering event; null for triggers and `run()`. */
    event: Event | null;
    /** The innermost event target, captured during dispatch. */
    target: EventTarget | null;
    /** The element carrying the binding. */
    element: E;
    /** Aborted when a newer run supersedes this one, when the element is removed, or on `stop()`. */
    signal: AbortSignal;
    /** The parsed `cw-props` JSON; null when absent. */
    props: P;
    /** The action name, e.g. "cart#add". */
    action: string;
    /** The CycleWire API. */
    wire: Wire;
    /**
     * `fetch()`, except that a plain GET of a URL the prefetch plugin fetched
     * on intent takes that response (cyclewire/prefetch).
     */
    fetch?: typeof fetch;
    /** The element's reactive scope (signals plugin). */
    state?: any;
    /** A named reactive store (signals plugin). */
    store?: (name: string, init?: object) => any;
}

/** An action handler. */
export type Action<P = any, E extends Element = Element> = (context: Context<P, E>) => unknown;

/** One run of an action, the same object in its `start` and `end` trace events. */
export interface TraceRun {
    el: Element;
    controller: AbortController;
}

/**
 * What the development build tells plugins through `trace`, as it happens.
 * The production build sends none of it.
 */
export type TraceEvent =
    /** A trigger or a scheduled preload was set up. */
    | { type: 'schedule'; element: Element; when: string; kind: 'trigger' | 'preload'; action?: string }
    /** A trigger fired before its action was registered. */
    | { type: 'wait'; element: Element; action: string }
    /** A module is being fetched ahead of use: `intent`, a `cw-preload` value, or none for `preload()`. */
    | { type: 'preload'; name: string; reason?: string }
    /** Data a `cw-prefetch` names is being fetched on intent. */
    | { type: 'prefetch'; url: string }
    /** A module import started, and settled. */
    | { type: 'import'; name: string }
    | { type: 'imported'; name: string; ok: boolean; error?: unknown }
    /** An event or call that ran nothing. */
    | { type: 'skip'; element: Element; action: string; event: Event | null; reason: 'unregistered' | 'cancelled' | 'once' | 'busy' }
    /** A run waits for input to pause, or for the run in flight (`latest`). */
    | { type: 'debounce'; element: Element; action: string; event: Event | null; wait: number }
    | { type: 'queue'; element: Element; action: string; event: Event | null }
    /** A run started, and ended. */
    | { type: 'start'; run: TraceRun; element: Element; action: string; event: Event | null; mode: string; cached: boolean; yields: boolean }
    | { type: 'end'; run: TraceRun; status: 'done' | 'aborted' }
    | { type: 'end'; run: TraceRun; status: 'error'; error: unknown };
