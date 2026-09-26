/**
 * Entry of `cyclewire.full.global.min.js`: every module in one classic
 * script. Exposes window.CycleWire with `css`, `dom`, `morph`, `signals`,
 * `stream`, `prefetch`, `request` and `bootstrap`, installs the styles plugin
 * (so `{ "module", "css" }` entries work), the prefetch plugin (so
 * `cw-prefetch` works), the signals plugin (disable with `"signals": false`),
 * the streams plugin when the config lists channels (`"streams": { "channels": … }`)
 * and the Bootstrap plugin when the config asks for it (`"bootstrap": true` or
 * `{ "global": true }`), and registers the `request` action when the config
 * asks for it (`"request": true`).
 */
import { boot } from './boot.js';
import * as bootstrap from './bootstrap.js';
import { css, styles } from './css.js';
import * as dom from './dom.js';
import * as core from './index.js';
import { morph } from './morph.js';
import { prefetch } from './prefetch.js';
import * as request from './request.js';
import * as signals from './signals.js';
import * as stream from './stream.js';

boot({ ...core, css, dom, morph, signals, stream, prefetch, request, bootstrap }, (config) => {
    // Markup reaches only the code you register, so the request action is yours to ask for.
    if (config.request) config.actions = { request: () => Promise.resolve(request), ...config.actions };
    config.plugins = [styles(), prefetch()];
    if (config.signals !== false) config.plugins.push(signals.signals());
    if (config.streams) config.plugins.push(stream.streams(config.streams));
    if (config.bootstrap) config.plugins.push(bootstrap.bootstrap(config.bootstrap === true ? {} : config.bootstrap));
});
