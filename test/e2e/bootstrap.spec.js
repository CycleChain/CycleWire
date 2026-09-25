import { expect, test } from '@playwright/test';
import { boot } from './helpers.js';

// Just enough of Bootstrap's CSS for clicks to land where they would.
const MARKUP = `
    <style>
        .modal:not(.show), .offcanvas:not(.show) { display: none; }
        .modal, .offcanvas { position: relative; z-index: 2; padding: 40px; }
        .modal-backdrop, .offcanvas-backdrop { position: fixed; inset: 0; z-index: 1; }
    </style>
    <div class="dropdown" id="dd">
        <button id="dd-toggle" data-bs-toggle="dropdown" aria-expanded="false">Menu</button>
        <ul class="dropdown-menu" id="dd-menu">
            <li><a class="dropdown-item" id="dd-one" href="#">One</a></li>
            <li><a class="dropdown-item" id="dd-two" href="#">Two</a></li>
        </ul>
    </div>
    <button id="c-toggle" data-bs-toggle="collapse" data-bs-target="#c-panel" aria-expanded="false">Collapse</button>
    <div class="collapse" id="c-panel">Panel</div>
    <div id="acc">
        <button id="a1-toggle" data-bs-toggle="collapse" data-bs-target="#a1">One</button>
        <div class="collapse show" id="a1" data-bs-parent="#acc">A1</div>
        <button id="a2-toggle" data-bs-toggle="collapse" data-bs-target="#a2">Two</button>
        <div class="collapse" id="a2" data-bs-parent="#acc">A2</div>
    </div>
    <a id="bad-href" data-bs-toggle="collapse" href="https://example.com/not-a-selector">Bad</a>
    <button id="m-open" data-bs-toggle="modal" data-bs-target="#m">Open modal</button>
    <div class="modal" id="m" aria-hidden="true" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
            <input id="m-first">
            <button id="m-last" data-bs-dismiss="modal">Close</button>
        </div></div>
    </div>
    <button id="s-open" data-bs-toggle="modal" data-bs-target="#s">Static</button>
    <div class="modal" id="s" data-bs-backdrop="static"><div class="modal-dialog"><button id="s-close" data-bs-dismiss="modal">x</button></div></div>
    <button id="o-open" data-bs-toggle="offcanvas" data-bs-target="#o">Offcanvas</button>
    <div class="offcanvas" id="o"><button id="o-close" data-bs-dismiss="offcanvas">x</button></div>
    <ul class="nav" role="tablist">
        <li><button class="nav-link active" id="t1" data-bs-toggle="tab" data-bs-target="#p1" aria-selected="true">T1</button></li>
        <li><button class="nav-link" id="t2" data-bs-toggle="tab" data-bs-target="#p2" aria-selected="false">T2</button></li>
    </ul>
    <div class="tab-content">
        <div class="tab-pane active show" id="p1">P1</div>
        <div class="tab-pane" id="p2">P2</div>
    </div>
    <div class="alert" id="alert">Saved <button id="alert-close" data-bs-dismiss="alert">x</button></div>
    <p id="outside">outside</p>`;

test.describe('bootstrap plugin', () => {
    test.beforeEach(async ({ page }) => {
        await boot(page, { start: false, html: MARKUP });
        await page.evaluate(() => {
            window.__bs = [];
            for (const name of ['show.bs.modal', 'shown.bs.modal', 'hide.bs.modal', 'hidden.bs.modal', 'shown.bs.tab']) {
                document.addEventListener(name, (event) => window.__bs.push(`${name}:${event.target.id}`));
            }
            window.CW.start({ plugins: [window.CWX.bootstrap.bootstrap({ global: true })] });
        });
    });

    test('dropdowns open, close outside, on items and on Escape', async ({ page }) => {
        await page.click('#dd-toggle');
        await expect(page.locator('#dd-menu')).toHaveClass(/show/);
        await expect(page.locator('#dd-toggle')).toHaveAttribute('aria-expanded', 'true');
        await page.click('#outside');
        await expect(page.locator('#dd-menu')).not.toHaveClass(/show/);

        await page.click('#dd-toggle');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#dd-one')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('#dd-menu')).not.toHaveClass(/show/);
        await expect(page.locator('#dd-toggle')).toBeFocused();

        await page.click('#dd-toggle');
        await page.click('#dd-two');
        await expect(page.locator('#dd-menu')).not.toHaveClass(/show/);
    });

    test('collapse toggles, accordions close siblings, and a URL href is harmless', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.click('#c-toggle');
        await expect(page.locator('#c-panel')).toHaveClass(/show/);
        await expect(page.locator('#c-toggle')).toHaveAttribute('aria-expanded', 'true');
        await page.click('#a2-toggle');
        await expect(page.locator('#a2')).toHaveClass(/show/);
        await expect(page.locator('#a1')).not.toHaveClass(/show/);
        await page.click('#bad-href');
        expect(errors).toEqual([]);
    });

    test('modals open with a backdrop, trap focus, and close back to the trigger', async ({ page }) => {
        await page.click('#m-open');
        await expect(page.locator('#m')).toHaveClass(/show/);
        await expect(page.locator('.modal-backdrop')).toHaveCount(1);
        await expect(page.locator('body')).toHaveClass(/modal-open/);
        await expect(page.locator('#m-first')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#m-last')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#m-first')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('#m')).not.toHaveClass(/show/);
        await expect(page.locator('.modal-backdrop')).toHaveCount(0);
        await expect(page.locator('#m-open')).toBeFocused();
        expect(await page.evaluate(() => window.__bs)).toEqual(['show.bs.modal:m', 'shown.bs.modal:m', 'hide.bs.modal:m', 'hidden.bs.modal:m']);
    });

    test('dismiss buttons and backdrop clicks close; static backdrops do not', async ({ page }) => {
        await page.click('#m-open');
        await page.click('#m-last');
        await expect(page.locator('#m')).not.toHaveClass(/show/);
        await page.click('#m-open');
        await page.locator('#m').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#m')).not.toHaveClass(/show/);
        await page.click('#s-open');
        await page.locator('#s').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#s')).toHaveClass(/show/);
        await page.click('#s-close');
        await expect(page.locator('#s')).not.toHaveClass(/show/);
    });

    test('window.bootstrap.Modal works for code written against Bootstrap', async ({ page }) => {
        await page.evaluate(() => window.bootstrap.Modal.getOrCreateInstance(document.getElementById('m')).show());
        await expect(page.locator('#m')).toHaveClass(/show/);
        await page.evaluate(() => window.bootstrap.Modal.getInstance(document.getElementById('m')).hide());
        await expect(page.locator('#m')).not.toHaveClass(/show/);
    });

    test('offcanvas opens and closes by dismiss or backdrop', async ({ page }) => {
        await page.click('#o-open');
        await expect(page.locator('#o')).toHaveClass(/show/);
        await expect(page.locator('.offcanvas-backdrop')).toHaveCount(1);
        await page.click('#o-close');
        await expect(page.locator('#o')).not.toHaveClass(/show/);
        await page.click('#o-open');
        await page.locator('.offcanvas-backdrop').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#o')).not.toHaveClass(/show/);
    });

    test('tabs switch panes and selection state', async ({ page }) => {
        await page.click('#t2');
        await expect(page.locator('#t2')).toHaveClass(/active/);
        await expect(page.locator('#t2')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#t1')).not.toHaveClass(/active/);
        await expect(page.locator('#p2')).toHaveClass(/active/);
        await expect(page.locator('#p1')).not.toHaveClass(/active/);
        expect(await page.evaluate(() => window.__bs)).toEqual(['shown.bs.tab:t2']);
    });

    test('alerts are dismissed', async ({ page }) => {
        await page.click('#alert-close');
        await expect(page.locator('#alert')).toHaveCount(0);
    });
});
