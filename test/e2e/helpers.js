import { expect } from '@playwright/test';

export const ACTIONS = {
    log: '/fixtures/actions/log.js',
    gated: '/fixtures/actions/gated.js',
    evaluated: '/fixtures/actions/evaluated.js',
};

/**
 * Opens the generic fixture page, renders `html` into #app and starts
 * CycleWire with the given actions and (serializable) options.
 */
export async function boot(page, { html = '', actions = ACTIONS, options = {}, build = 'esm-dev', start = true } = {}) {
    await page.goto(`/fixtures/?build=${build}`);
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(({ html, actions, options, start }) => {
        document.getElementById('app').innerHTML = html;
        if (start) window.CW.start({ ...options, actions });
    }, { html, actions, options, start });
}

export const log = (page) => page.evaluate(() => window.__log);
export const warnings = (page) => page.evaluate(() => window.__warnings);
export const open = (page, id) => page.evaluate((gate) => window.__open(gate), id);

/** Polls the action log until it deep-equals `expected`. */
export const expectLog = (page, expected) => expect.poll(() => log(page)).toEqual(expected);

/** Resolves once a JSON-stringified log entry contains `fragment`. */
export const waitForLog = (page, fragment) =>
    page.waitForFunction((text) => window.__log.some((entry) => JSON.stringify(entry).includes(text)), fragment);
