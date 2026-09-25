/**
 * Side-effect entry: `import 'cyclewire/auto'`, or the classic-script build
 * `cyclewire.global.min.js`. Reads `<script type="application/json"
 * data-cyclewire>`, starts CycleWire and sets `window.CycleWire`.
 */
import { boot } from './boot.js';

boot();
