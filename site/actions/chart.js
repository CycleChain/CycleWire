// A `visible` trigger: nothing is fetched until this card nears the viewport.
// cyclewire/dom and cyclewire/css arrive with this module, and the chart's
// stylesheet applies before the bars are drawn. The sizes come from
// dist/sizes.json, written by `npm run size`.
import { css } from 'cyclewire/css';
import { html, swap } from 'cyclewire/dom';

const BARS = [
    ['cyclewire.min.js', 'core'],
    ['css.min.js', 'css'],
    ['dom.min.js', 'dom'],
    ['morph.min.js', 'morph'],
    ['signals.min.js', 'signals'],
    ['bootstrap.min.js', 'bootstrap'],
    ['cyclewire.full.global.min.js', 'everything'],
];

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

const sizes = async (signal) => (await (await fetch('./dist/sizes.json', { signal })).json()).files;

export async function run({ element, signal }) {
    const target = element.querySelector('.chart__bars');
    let files;
    try {
        // The data and the stylesheet load in parallel.
        [files] = await Promise.all([sizes(signal), css('./styles/chart.css', element)]);
    } catch (error) {
        if (signal.aborted) return;
        swap(target, 'Sizes appear here after `npm run size`.');
        return;
    }
    const max = Math.max(...BARS.map(([file]) => files[file]?.brotli || 0));
    swap(target, html`${BARS.filter(([file]) => files[file]).map(([file, label]) => html`
        <div class="bar">
            <span class="bar__label">${label}</span>
            <span class="bar__track"><span class="bar__fill" style="--size: ${(files[file].brotli / max).toFixed(3)}"></span></span>
            <span class="bar__value">${kB(files[file].brotli)}</span>
        </div>`)}`);
    // Let the bars grow in on the next frame.
    requestAnimationFrame(() => element.classList.add('is-drawn'));
}
