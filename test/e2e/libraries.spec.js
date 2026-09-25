import { expect, test } from '@playwright/test';

// The libraries example (examples/libraries/, built by test/global-setup.js):
// Flatpickr, SweetAlert2, DataTables and jQuery on a server-rendered page,
// each loaded by the action that uses it.
test.describe('popular libraries', () => {
    /** Console errors and warnings, including CycleWire's development warnings. */
    let problems;

    test.beforeEach(async ({ page }) => {
        problems = [];
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
        });
        page.on('pageerror', (error) => problems.push(error.message));
        await page.goto('/examples/libraries/');
        await page.waitForFunction(() => typeof window.wire === 'object');
    });

    const loaded = (page) => page.evaluate(() => window.wire.loaded().sort());

    async function enhanceTable(page) {
        await page.locator('#projects').scrollIntoViewIfNeeded();
        await expect(page.locator('.dt-container')).toBeVisible();
    }

    test('Flatpickr loads on the first focus, with its stylesheet, and fills the field', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        expect(await loaded(page)).toEqual([]);
        expect(await page.locator('link[href*="flatpickr"]').count()).toBe(0);

        await page.focus('#due');
        const calendar = page.locator('.flatpickr-calendar.open');
        await expect(calendar).toBeVisible();
        // flatpickr.css positions the calendar; unstyled, it would sit in the page flow.
        expect(await calendar.evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
        await calendar.locator('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)').first().click();
        await expect(page.locator('#due')).toHaveValue(/^\d{4}-\d{2}-01$/);
        expect(await loaded(page)).toEqual(['datepicker']);
        expect(problems).toEqual([]);
    });

    test('SweetAlert2 asks before a destructive submit', async ({ page }) => {
        const popup = page.locator('.swal2-popup');
        await page.click('#delete button');
        await expect(popup).toBeVisible();
        await expect(popup).toContainText('Delete project Atlas?');
        await page.click('.swal2-cancel');
        await expect(popup).toBeHidden();
        await expect(page.locator('#delete')).toBeVisible();

        await page.click('#delete button');
        await page.click('.swal2-confirm');
        await expect(page.getByRole('status').filter({ hasText: 'Project Atlas was deleted.' })).toBeVisible();
        await expect(page.locator('#delete')).toHaveCount(0);
        expect(new URL(page.url()).pathname).toBe('/examples/libraries/');
        expect(problems).toEqual([]);
    });

    test('DataTables enhances the table when it scrolls into view, and row actions survive paging and search', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        expect(await loaded(page)).toEqual([]);
        await expect(page.locator('#projects tbody tr')).toHaveCount(12);
        await expect(page.locator('.dt-container')).toHaveCount(0);

        await enhanceTable(page);
        await expect(page.locator('#projects tbody tr')).toHaveCount(5);
        // The DataTables stylesheet applied: it removes the table's border spacing.
        expect(await page.locator('#projects').evaluate((table) => getComputedStyle(table).borderSpacing)).toMatch(/^0px( 0px)?$/);

        // Rows DataTables drew after the fact run their actions without any re-binding.
        await page.locator('.dt-paging-button', { hasText: '2' }).click();
        await page.locator('#p7').getByRole('button', { name: 'Archive' }).click();
        await expect(page.locator('#p7')).toHaveClass(/is-archived/);
        await expect(page.locator('#p7 button')).toHaveText('Archived');

        await page.locator('.dt-search input').fill('Kestrel');
        await expect(page.locator('#projects tbody tr')).toHaveCount(1);
        await page.locator('#p11').getByRole('button', { name: 'Archive' }).click();
        await expect(page.locator('#p11')).toHaveClass(/is-archived/);
        expect(await loaded(page)).toEqual(['projects', 'table']);
        expect(problems).toEqual([]);
    });

    test('jQuery code hears CycleWire\'s events, and the markup it inserts is live', async ({ page }) => {
        await enhanceTable(page);
        // .trigger('click') ends in the element's native click(), which CycleWire handles like any click.
        await page.evaluate(() => window.jQuery('#p2 button').trigger('click'));
        await expect(page.locator('#p2')).toHaveClass(/is-archived/);

        // The page's jQuery code turned cw:done into an entry with an Undo button: a CycleWire action.
        const entry = page.locator('#activity-p2');
        await expect(entry).toContainText('Borealis archived.');
        await entry.getByRole('button', { name: 'Undo' }).click();
        await expect(page.locator('#p2')).not.toHaveClass(/is-archived/);
        await expect(entry).toHaveCount(0);
        expect(problems).toEqual([]);
    });

    test('jQuery\'s .trigger() reaches CycleWire only where it ends in a native method', async ({ page }) => {
        const seen = await page.evaluate(() => {
            const seen = [];
            // Record what CycleWire is about to run, and cancel it.
            document.addEventListener('cw:run', (event) => {
                seen.push(event.detail.event.type);
                event.preventDefault();
            });
            const select = document.createElement('select');
            select.setAttribute('data-cw-on-change', 'projects#archive');
            const button = document.createElement('button');
            button.setAttribute('data-cw-action', 'projects#archive');
            document.body.append(select, button);
            window.jQuery(button).trigger('click'); // calls button.click(): a real click event
            window.jQuery(select).trigger('change'); // jQuery handlers only
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return seen;
        });
        expect(seen).toEqual(['click', 'change']);
    });
});
