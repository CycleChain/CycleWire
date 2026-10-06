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

test('the request demo appends older releases, and its button keeps focus to the end', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('#feed-more');
    await button.evaluate((element) => { element.__same = true; });
    // From the keyboard, where keeping focus matters.
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#feed li')).toHaveCount(6);
    await expect(button).toHaveAttribute('cw-get', './partials/feed-3.html');
    // Morphed, not replaced: the same element, still focused.
    expect(await button.evaluate((element) => element.__same === true && document.activeElement === element)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#feed li')).toHaveCount(8);
    await expect(button).toHaveText("That's every release");
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toBeFocused();
    // aria-disabled: CycleWire swallows the click.
    await button.click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator('#feed li')).toHaveCount(8);
});

test('on a 320 px screen the page fits, with every demo\'s code open', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.locator('.demo__code').evaluateAll((samples) => samples.forEach((sample) => { sample.open = true; }));
    // A long line of code scrolls inside its sample; the page never scrolls sideways.
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBe(client);
});
