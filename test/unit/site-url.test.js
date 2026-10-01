import assert from 'node:assert/strict';
import { test } from 'node:test';

// scripts/site-url.js reads CYCLEWIRE_SITE when it is first imported, so each
// case imports a fresh copy (a module's URL, query included, is its identity).
let copies = 0;
async function load(site) {
    const before = process.env.CYCLEWIRE_SITE;
    if (site === undefined) delete process.env.CYCLEWIRE_SITE;
    else process.env.CYCLEWIRE_SITE = site;
    try {
        return await import(`../../scripts/site-url.js?copy=${copies++}`);
    } finally {
        if (before === undefined) delete process.env.CYCLEWIRE_SITE;
        else process.env.CYCLEWIRE_SITE = before;
    }
}

test('without CYCLEWIRE_SITE the site is on GitHub Pages, and links stay as written', async () => {
    const { PAGES, SITE, relocate } = await load(undefined);
    assert.equal(SITE, PAGES);
    assert.equal(relocate(`<meta property="og:url" content="${PAGES}">`), `<meta property="og:url" content="${PAGES}">`);
});

test('CYCLEWIRE_SITE moves the site, and links to the Pages address follow it', async () => {
    const { PAGES, SITE, relocate } = await load('https://cyclechain.io/labs/cyclewire/');
    assert.equal(SITE, 'https://cyclechain.io/labs/cyclewire/');
    assert.equal(
        relocate(`<a href="${PAGES}examples/react/">React</a> <img src="${PAGES}og.png">`),
        '<a href="https://cyclechain.io/labs/cyclewire/examples/react/">React</a> <img src="https://cyclechain.io/labs/cyclewire/og.png">',
    );
});

test('the redirect page sends every old address to the same page at the new one', async () => {
    const { redirectPage } = await import('../../scripts/redirect-site.js');
    const html = redirectPage('https://cyclechain.github.io/CycleWire/', 'https://cyclechain.io/labs/cyclewire/');
    assert.match(html, /<link rel="canonical" href="https:\/\/cyclechain\.io\/labs\/cyclewire\/">/);
    assert.match(html, /<noscript><meta http-equiv="refresh" content="0; url=https:\/\/cyclechain\.io\/labs\/cyclewire\/"><\/noscript>/);
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    const go = (pathname, search = '', hash = '') => {
        let target = '';
        new Function('location', code)({ pathname, search, hash, replace: (url) => { target = url; } });
        return target;
    };
    assert.equal(go('/CycleWire/'), 'https://cyclechain.io/labs/cyclewire/');
    assert.equal(go('/CycleWire/docs/request/', '', '#security'), 'https://cyclechain.io/labs/cyclewire/docs/request/#security');
    assert.equal(go('/CycleWire/examples/react/', '?x=1'), 'https://cyclechain.io/labs/cyclewire/examples/react/?x=1');
});
