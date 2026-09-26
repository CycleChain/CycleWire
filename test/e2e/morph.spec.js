import { expect, test } from '@playwright/test';
import { boot, log } from './helpers.js';

/** Morphs #app with trusted markup from the page context. */
const morph = (page, markup, options = {}) => page.evaluate(({ markup, options }) => {
    const { morph } = window.CWX.morph;
    const { html } = window.CWX.dom;
    return morph(document.getElementById('app'), html.raw(markup), options);
}, { markup, options });

/** Tags elements so a spec can tell a kept element from a recreated one. */
const tag = (page, ids) => page.evaluate((list) => list.forEach((id) => {
    document.getElementById(id).__kept = id;
}), ids);
const kept = (page, ids) => page.evaluate((list) => list.map((id) => document.getElementById(id)?.__kept === id), ids);

test.describe('cyclewire/morph', () => {
    test('elements with ids are kept and reordered, not recreated', async ({ page }) => {
        await boot(page, { html: '<ul id="list"><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>' });
        await tag(page, ['a', 'b', 'c']);
        await morph(page, '<ul id="list"><li id="c">C!</li><li id="a">A</li><li id="d">D</li></ul>');
        expect(await page.evaluate(() => [...document.querySelectorAll('li')].map((li) => `${li.id}:${li.textContent}`))).toEqual(['c:C!', 'a:A', 'd:D']);
        expect(await kept(page, ['a', 'c'])).toEqual([true, true]);
        expect(await page.evaluate(() => document.getElementById('b'))).toBeNull();
    });

    test('the focused input keeps focus, caret and what the user typed', async ({ page }) => {
        await boot(page, { html: '<p id="status">Saving…</p><input id="name" value="server">' });
        await page.fill('#name', 'typed by user');
        await page.evaluate(() => document.getElementById('name').setSelectionRange(2, 5));
        await morph(page, '<input id="name" value="server v2"><p id="status">Saved</p>');
        await expect(page.locator('#name')).toBeFocused();
        await expect(page.locator('#name')).toHaveValue('typed by user');
        expect(await page.evaluate(() => [document.activeElement.selectionStart, document.activeElement.selectionEnd])).toEqual([2, 5]);
        await expect(page.locator('#status')).toHaveText('Saved');
    });

    test('edited controls follow a changed attribute unless focused, and keep unchanged ones', async ({ page }) => {
        await boot(page, { html: '<input id="a" value="1"><input id="b" value="1"><input id="c" type="checkbox"><input id="d" type="checkbox">' });
        await page.fill('#a', 'user');
        await page.fill('#b', 'user');
        // Toggling back and forth marks both checkboxes as edited by the user.
        for (const id of ['#d', '#c']) {
            await page.check(id);
            await page.uncheck(id);
        }
        // Safari does not focus a clicked checkbox; focus it explicitly.
        await page.focus('#c');
        await morph(page, '<input id="a" value="1"><input id="b" value="2"><input id="c" type="checkbox" checked><input id="d" type="checkbox" checked>');
        await expect(page.locator('#a')).toHaveValue('user');
        await expect(page.locator('#b')).toHaveValue('2');
        await expect(page.locator('#d')).toBeChecked();
        // Focused: left as the user set it, even though the attribute changed.
        await expect(page.locator('#c')).not.toBeChecked();
    });

    test('cw-key pairs siblings without ids', async ({ page }) => {
        await boot(page, { html: '<div cw-key="1" class="row">one</div><div cw-key="2" class="row">two</div>' });
        await page.evaluate(() => document.querySelectorAll('.row').forEach((el) => { el.__key = el.getAttribute('cw-key'); }));
        await morph(page, '<div cw-key="2" class="row">two</div><div cw-key="1" class="row">one</div>');
        expect(await page.evaluate(() => [...document.querySelectorAll('.row')].map((el) => el.__key))).toEqual(['2', '1']);
    });

    test('cw-preserve leaves an element alone', async ({ page }) => {
        await boot(page, { html: '<div id="widget" cw-preserve class="client">client state</div>' });
        await morph(page, '<div id="widget" cw-preserve class="server">server</div>');
        await expect(page.locator('#widget')).toHaveText('client state');
        await expect(page.locator('#widget')).toHaveClass('client');
    });

    test('elements that move to another parent keep their identity', async ({ page }) => {
        await boot(page, { html: '<section id="left"><article id="x">x</article></section><section id="right"></section>' });
        await tag(page, ['x']);
        await morph(page, '<section id="left"></section><section id="right"><div class="wrap"><article id="x">x</article></div></section>');
        expect(await kept(page, ['x'])).toEqual([true]);
        expect(await page.evaluate(() => document.getElementById('x').parentElement.className)).toBe('wrap');
        expect(await page.evaluate(() => document.querySelectorAll('[hidden]').length)).toBe(0);
    });

    test('a moved iframe is not reloaded where moveBefore() exists', async ({ page }) => {
        await boot(page, { html: '<p id="p1">one</p><iframe id="f" src="/fixtures/frame.html"></iframe><p id="p2">two</p>' });
        await page.waitForFunction(() => window.__frameLoads === 1);
        const hasMoveBefore = await page.evaluate(() => 'moveBefore' in Element.prototype);
        await morph(page, '<iframe id="f" src="/fixtures/frame.html"></iframe><p id="p1">one</p><p id="p2">two</p>');
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__frameLoads)).toBe(hasMoveBefore ? 1 : 2);
    });

    test('hooks can veto updates and removals', async ({ page }) => {
        await boot(page, { html: '<p id="keep">keep me</p><p id="frozen">frozen</p>' });
        await page.evaluate(() => {
            const { morph } = window.CWX.morph;
            const { html } = window.CWX.dom;
            morph(document.getElementById('app'), html`<p id="frozen">thawed</p>`, {
                beforeRemove: (node) => node.id !== 'keep',
                beforeUpdate: (from) => from.id !== 'frozen',
            });
        });
        await expect(page.locator('#keep')).toHaveText('keep me');
        await expect(page.locator('#frozen')).toHaveText('frozen');
    });

    test('children: false morphs the target element itself', async ({ page }) => {
        await boot(page, { html: '<div id="card" class="old" data-x="1"><span>old</span></div>' });
        await tag(page, ['card']);
        await page.evaluate(() => {
            const { morph } = window.CWX.morph;
            const { html } = window.CWX.dom;
            morph(document.getElementById('card'), html`<div id="card" class="new"><span>new</span></div>`, { children: false });
        });
        expect(await kept(page, ['card'])).toEqual([true]);
        expect(await page.evaluate(() => document.getElementById('card').outerHTML)).toBe('<div id="card" class="new"><span>new</span></div>');
    });

    test('plain strings are refused; trusted markup must be marked with html.raw', async ({ page }) => {
        await boot(page, { html: '<p>x</p>' });
        const message = await page.evaluate(() => {
            try {
                window.CWX.morph.morph(document.getElementById('app'), '<b>x</b>');
                return 'accepted';
            } catch (error) {
                return error.message;
            }
        });
        expect(message).toContain('html.raw');
    });

    test('triggers in morphed-in content are activated, and transition() is supported', async ({ page }) => {
        await boot(page, { html: '<p>before</p>' });
        await morph(page, '<div id="fresh" cw-action="log" cw-trigger="load"></div>', { transition: true });
        await expect.poll(async () => (await log(page)).map((entry) => entry.el)).toEqual(['fresh']);
    });
});
