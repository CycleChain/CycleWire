/**
 * Entry of `cyclewire.full.global.min.js`: every module in one classic
 * script. Exposes window.CycleWire with `css`, `dom`, `morph`, `signals`,
 * `stream`, `prefetch` and `bootstrap`, installs the styles plugin (so
 * `{ "module", "css" }` entries work), the prefetch plugin (so `cw-prefetch`
 * works), the signals plugin (disable with `"signals": false`), the streams
 * plugin when the config lists channels (`"streams": { "channels": … }`)
 * and the Bootstrap plugin when the config asks for it (`"bootstrap": true` or
 * `{ "global": true }`).
 */
import { boot } from './boot.js';
import * as bootstrap from './bootstrap.js';
import { css, styles } from './css.js';
import * as dom from './dom.js';
import * as core from './index.js';
import { morph } from './morph.js';
import { prefetch } from './prefetch.js';
import * as signals from './signals.js';
import * as stream from './stream.js';

boot({ ...core, css, dom, morph, signals, stream, prefetch, bootstrap }, (config) => {
    config.plugins = [styles(), prefetch()];
    if (config.signals !== false) config.plugins.push(signals.signals());
    if (config.streams) config.plugins.push(stream.streams(config.streams));
    if (config.bootstrap) config.plugins.push(bootstrap.bootstrap(config.bootstrap === true ? {} : config.bootstrap));
});
