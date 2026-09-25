import { expect, test } from '@playwright/test';
import { boot } from './helpers.js';

test.describe('cyclewire/dom', () => {
    test.beforeEach(async ({ page }) => {
        await boot(page, { start: false, html: '<div id="t"><p id="old">old</p></div><input id="q" value="hello">' });
    });

    test('fragments parse inertly: no handler fires and no script runs', async ({ page }) => {
        const fired = await page.evaluate(async () => {
            const { fragment, html } = window.CWX.dom;
            const frag = fragment(html.raw('<img src="/nope.png" onerror="window.__inert = \'img\'"><script>window.__inert = "script"</script>'));
            await new Promise((resolve) => setTimeout(resolve, 200));
            const beforeInsert = window.__inert;
            document.getElementById('t').append(frag);
            await new Promise((resolve) => setTimeout(resolve, 200));
            return { beforeInsert, afterInsert: window.__inert };
        });
        expect(fired.beforeInsert).toBeUndefined();
        // Once inserted the image is live (its markup was trusted), but the script never runs.
        expect(fired.afterInsert).toBe('img');
    });

    test('swap supports every mode and treats plain strings as text', async ({ page }) => {
        const result = await page.evaluate(() => {
            const { swap, html } = window.CWX.dom;
            const t = document.getElementById('t');
            swap(t, html`<b>${'<i>'}</b>`);
            const inner = t.innerHTML;
            swap(t, '<em>text</em>');
            const text = t.innerHTML;
            swap(t, html`<span id="a">a</span>`, 'append');
            swap(t, html`<span id="p">p</span>`, 'prepend');
            swap(t, html`<hr id="before">`, 'before');
            swap(t, html`<hr id="after">`, 'after');
            const order = [...document.getElementById('app').querySelectorAll('[id]')].map((el) => el.id).join(',');
            swap(t, html`<section id="outer"></section>`, 'outer');
            return { inner, text, order, outer: !!document.getElementById('outer') && !document.getElementById('t') };
        });
        expect(result.inner).toBe('<b>&lt;i&gt;</b>');
        expect(result.text).toBe('&lt;em&gt;text&lt;/em&gt;');
        expect(result.order).toBe('before,t,p,a,after,q');
        expect(result.outer).toBe(true);
    });

    test('swap keeps focus and selection when the focused element is replaced by id', async ({ page }) => {
        await page.focus('#q');
        await page.evaluate(() => document.getElementById('q').setSelectionRange(1, 3));
        await page.evaluate(() => {
            const { swap, html } = window.CWX.dom;
            swap(document.getElementById('app'), html`<div id="t"></div><input id="q" value="hello again">`);
        });
        await expect(page.locator('#q')).toHaveValue('hello again');
        await expect(page.locator('#q')).toBeFocused();
        expect(await page.evaluate(() => [document.activeElement.selectionStart, document.activeElement.selectionEnd])).toEqual([1, 3]);
    });

    test('transition updates the DOM with or without View Transitions', async ({ page }) => {
        const texts = await page.evaluate(async () => {
            const { transition } = window.CWX.dom;
            const el = document.getElementById('old');
            await transition(() => {
                el.textContent = 'one';
            });
            const first = el.textContent;
            document.startViewTransition = undefined;
            await transition(() => {
                el.textContent = 'two';
            });
            return [first, el.textContent];
        });
        expect(texts).toEqual(['one', 'two']);
    });

    test('declarative shadow DOM in fetched markup is attached', async ({ page }) => {
        const supported = await page.evaluate(() => 'setHTMLUnsafe' in HTMLTemplateElement.prototype);
        test.skip(!supported, 'setHTMLUnsafe is not available in this browser build');
        const inside = await page.evaluate(() => {
            const { swap, html } = window.CWX.dom;
            swap(document.getElementById('t'), html.raw('<x-box id="box"><template shadowrootmode="open"><b id="deep">deep</b></template></x-box>'));
            return document.getElementById('box').shadowRoot?.getElementById('deep')?.textContent;
        });
        expect(inside).toBe('deep');
    });

    test('works under a Trusted Types policy named "cyclewire"', async ({ page }) => {
        await page.goto('/fixtures/?build=esm-dev');
        await page.setContent(`<!doctype html>
            <meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types cyclewire">
            <div id="t"></div>
            <script type="module">
                const { swap, html } = await import('/dist/esm-dev/dom.js');
                const t = document.getElementById('t');
                swap(t, html\`<b id="ok">\${'<safe>'}</b>\`);
                try { t.innerHTML = '<i>raw</i>'; window.__raw = 'allowed'; } catch { window.__raw = 'blocked'; }
                window.__done = true;
            </script>`);
        await page.waitForFunction(() => window.__done === true);
        const enforced = await page.evaluate(() => !!window.trustedTypes);
        await expect(page.locator('#ok')).toHaveText('<safe>');
        if (enforced) expect(await page.evaluate(() => window.__raw)).toBe('blocked');
    });
});
