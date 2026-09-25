/**
 * Entry of `cyclewire.full.global.min.js`: every module in one classic
 * script. Exposes window.CycleWire with `css`, `dom`, `morph`, `signals` and
 * `bootstrap`, installs the styles plugin (so `{ "module", "css" }` entries
 * work), the signals plugin (disable with `"signals": false`) and the
 * Bootstrap plugin when the config asks for it (`"bootstrap": true` or
 * `{ "global": true }`).
 */
import { boot } from './boot.js';
import * as bootstrap from './bootstrap.js';
import { css, styles } from './css.js';
import * as dom from './dom.js';
import * as core from './index.js';
import { morph } from './morph.js';
import * as signals from './signals.js';

boot({ ...core, css, dom, morph, signals, bootstrap }, (config) => {
    config.plugins = [styles()];
    if (config.signals !== false) config.plugins.push(signals.signals());
    if (config.bootstrap) config.plugins.push(bootstrap.bootstrap(config.bootstrap === true ? {} : config.bootstrap));
});
