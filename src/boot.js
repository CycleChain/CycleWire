import * as wire from './index.js';

const CONFIG = 'script[type="application/json"][data-cyclewire]';

/**
 * Exposes `api` as `window.CycleWire` and starts CycleWire with the JSON
 * block `<script type="application/json" data-cyclewire>`, if the page has
 * one. Place that block before the CycleWire script; if it is not there yet
 * while the page is still loading, start waits for DOMContentLoaded.
 *
 * @param {object} [api] the namespace to expose
 * @param {(config: any) => void} [configure] adjusts the parsed config before start
 */
export function boot(api = wire, configure) {
    /** @type {any} */ (globalThis).CycleWire = api;
    const go = () => {
        const script = document.querySelector(CONFIG);
        /** @type {any} */
        let config = {};
        try {
            if (script) config = JSON.parse(script.textContent || '{}');
        } catch (error) {
            console.error('[CycleWire] <script data-cyclewire> does not contain valid JSON:', error);
        }
        configure?.(config);
        wire.start(config);
    };
    if (!document.querySelector(CONFIG) && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go, { once: true });
    } else {
        go();
    }
}
