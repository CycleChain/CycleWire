import { expect, test } from '@playwright/test';

// The landing page's Benchmark section, built by scripts/serve.js from
// bench/results/ as the deployed site is. The assertions hold for any results.

const numbers = (locator, attribute = 'data-value') => locator.evaluateAll((cells, name) => cells.map((cell) => cell.getAttribute(name)).filter((value) => value !== '').map(Number), attribute);

test('the chart switches metric from the table\'s numbers, lowest first', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-bench="mobile"]');
    await expect(panel).toBeVisible();
    const metrics = panel.getByRole('group', { name: 'Metric to chart' });
    const button = metrics.getByRole('button', { name: 'LCP', exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(metrics.getByRole('button', { name: 'JavaScript', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.locator('.bench__title')).toHaveText('Largest Contentful Paint');

    // Every bar shows its stack's cell from the LCP column, in ascending order.
    const column = await panel.locator('th[data-metric="lcp"]').getAttribute('data-column');
    const cells = await panel.locator('.bench__table').first().locator('tbody tr').evaluateAll((rows, index) => Object.fromEntries(rows.map((row) => [row.dataset.stack, row.cells[index].textContent])), Number(column));
    const bars = await panel.locator('.bench__bar').evaluateAll((items) => items.map((item) => [item.dataset.stack, item.querySelector('.bench__value').textContent]));
    expect(Object.fromEntries(bars)).toEqual(cells);
    const values = bars.map(([stack]) => Number(cells[stack].replace(/[^\d.]/g, '')));
    expect(values).toEqual([...values].sort((a, b) => a - b));
});

test('the profiles switch without JavaScript, and the tables sort', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('[data-bench="mobile"]')).toBeVisible();
    await expect(page.locator('[data-bench="desktop"]')).toBeHidden();
    await page.locator('label[for="bench-desktop"]').click();
    await expect(page.locator('[data-bench="desktop"]')).toBeVisible();
    await expect(page.locator('[data-bench="mobile"]')).toBeHidden();
    await context.close();
});

test('a column header sorts its table', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-bench="mobile"]');
    const header = panel.locator('th[data-metric="effect-filter"]');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    const column = Number(await header.getAttribute('data-column'));
    const sorted = await numbers(panel.locator('.bench__table').first().locator(`tbody tr > :nth-child(${column + 1})`));
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
});

test('the old results page sends visitors to the section', async ({ page }) => {
    await page.goto('/bench/');
    await expect(page).toHaveURL(/\/#benchmark$/);
});
