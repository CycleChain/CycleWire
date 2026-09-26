// Charts the benchmark metric whose button was pressed. The numbers come from
// the table under the chart, which the server rendered with it, so nothing is
// fetched: one bar per stack, lowest first, with a whisker for the 95%
// confidence interval of the median. The bars move with a view transition
// where the browser has them.
const number = (value) => (value === undefined || value === '' ? null : Number(value));

export function run({ element }) {
    const panel = element.closest('[data-bench]');
    const header = panel.querySelector(`th[data-metric="${element.dataset.metric}"]`);
    if (!header) return;
    const column = Number(header.dataset.column);
    const chart = panel.querySelector('.bench__chart');
    const list = chart.querySelector('.bench__bars');

    const bars = [...header.closest('table').tBodies[0].rows].map((row) => {
        const cell = row.cells[column];
        const value = number(cell.dataset.value);
        return {
            bar: list.querySelector(`[data-stack="${row.dataset.stack}"]`),
            cell,
            value,
            low: number(cell.dataset.low) ?? value,
            high: number(cell.dataset.high) ?? value,
        };
    }).filter(({ bar }) => bar);
    bars.sort((a, b) => (a.value === null) - (b.value === null) || a.value - b.value);
    const max = Math.max(0, ...bars.map(({ high }) => high ?? 0));
    const percent = (value) => `${max ? ((value / max) * 100).toFixed(2) : 0}%`;

    const draw = () => {
        for (const button of element.parentElement.children) button.setAttribute('aria-pressed', String(button === element));
        chart.querySelector('.bench__title').textContent = header.dataset.title;
        for (const { bar, cell, value, low, high } of bars) {
            bar.querySelector('.bench__fill').style.width = percent(value ?? 0);
            const whisker = bar.querySelector('.bench__ci');
            whisker.style.left = percent(low ?? 0);
            whisker.style.width = percent((high ?? 0) - (low ?? 0));
            // The same text as the table: the value, and how an early tap was handled.
            bar.querySelector('.bench__value').replaceChildren(...[...cell.childNodes].map((node) => node.cloneNode(true)));
            list.append(bar);
        }
    };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return draw();
    // Only while the bars move do they get names to transition by.
    chart.classList.add('is-moving');
    document.startViewTransition(draw).finished.finally(() => chart.classList.remove('is-moving'));
}
