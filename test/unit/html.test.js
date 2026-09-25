import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHTML, html, isSafeHTML, SafeHTML } from '../../src/dom.js';

const markup = (value) => String(value);

test('escapes interpolated text', () => {
    const name = '<img src=x onerror=alert(1)> & "quotes"';
    assert.equal(markup(html`<p>${name}</p>`), '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;</p>');
});

test('escapes attribute values, quoted either way', () => {
    const value = `" onmouseover="alert(1)`;
    assert.equal(markup(html`<a title="${value}">x</a>`), '<a title="&quot; onmouseover=&quot;alert(1)">x</a>');
    assert.equal(markup(html`<a title='${"'"}'>x</a>`), `<a title='&#39;'>x</a>`);
});

test('nests html results and arrays without double escaping', () => {
    const items = ['a<b', 'c'];
    const list = html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>`;
    assert.equal(markup(list), '<ul><li>a&lt;b</li><li>c</li></ul>');
});

test('renders nothing for null, undefined and false, and text for numbers', () => {
    assert.equal(markup(html`<p>${null}${undefined}${false}${0}${1.5}</p>`), '<p>01.5</p>');
});

test('html.raw is the explicit way to trust markup', () => {
    const trusted = html.raw('<b>server</b>');
    assert.ok(trusted instanceof SafeHTML);
    assert.equal(markup(html`<p>${trusted}</p>`), '<p><b>server</b></p>');
});

test('trusted markup is still only text inside an attribute', () => {
    assert.equal(markup(html`<p title="${html.raw('<b>')}"></p>`), '<p title="&lt;b&gt;"></p>');
});

test('objects from JSON can never pass as markup', () => {
    const forged = JSON.parse('{"markup": "<img src=x onerror=alert(1)>"}');
    assert.equal(isSafeHTML(forged), false);
    assert.equal(markup(html`<p>${forged}</p>`), '<p>[object Object]</p>');
});

test('refuses positions escaping cannot protect', () => {
    const value = 'x';
    assert.throws(() => html`<a href=${value}>`, /unquoted value/);
    assert.throws(() => html`<div ${value}>`, /tag or attribute name/);
    assert.throws(() => html`<${value}>`, /tag or attribute name/);
    assert.throws(() => html`</${value}>`, /tag or attribute name/);
    assert.throws(() => html`<button onclick="${value}">`, /onclick/);
    assert.throws(() => html`<iframe srcdoc="${value}">`, /srcdoc/);
    assert.throws(() => html`<script>${value}</script>`, /inside <script>/);
    assert.throws(() => html`<style>${value}</style>`, /inside <style>/);
    assert.throws(() => html`<!-- ${value} -->`, /comment/);
});

test('text after a closed raw-text element is fine again', () => {
    const value = '<b>';
    assert.equal(markup(html`<script>var a = 1;</script><p>${value}</p>`), '<script>var a = 1;</script><p>&lt;b&gt;</p>');
    assert.equal(markup(html`<!-- note --><p>${value}</p>`), '<!-- note --><p>&lt;b&gt;</p>');
});

test('refuses script URLs where an interpolation starts a URL attribute', () => {
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'vbscript:msgbox(1)']) {
        assert.throws(() => html`<a href="${url}">x</a>`, /refusing the URL/, url);
    }
    assert.throws(() => html`<img src="${'javascript:x'}">`, /refusing the URL/);
    assert.throws(() => html`<form action="${'javascript:x'}"></form>`, /refusing the URL/);
});

test('allows ordinary URLs, and script-looking text after a static prefix', () => {
    assert.equal(markup(html`<a href="${'/cart?id=1&x=2'}">x</a>`), '<a href="/cart?id=1&amp;x=2">x</a>');
    assert.equal(markup(html`<a href="${'https://example.com'}">x</a>`), '<a href="https://example.com">x</a>');
    assert.equal(markup(html`<a href="/search?q=${'javascript:x'}">x</a>`), '<a href="/search?q=javascript:x">x</a>');
    assert.equal(markup(html`<img src="${'data:image/png;base64,AAAA'}">`), '<img src="data:image/png;base64,AAAA">');
});

test('refuses a script URL however the value is put together', () => {
    const cases = [
        () => html`<a href="${'java'}${'script:alert(1)'}">x</a>`,
        () => html`<a href="${''}${'javascript:alert(1)'}">x</a>`,
        () => html`<a href="${'javascript'}:${'alert(1)'}">x</a>`,
        () => html`<a href="${['java', 'script:alert(1)']}">x</a>`,
        () => html`<a href="${html`${'javascript:alert(1)'}`}">x</a>`,
        () => html`<a href="${html.raw('javascript:alert(1)')}">x</a>`,
        () => html`<a href=" ${'javascript:alert(1)'}">x</a>`,
        () => html`<a href="javascript:${'alert(1)'}">x</a>`,
        () => html`<a href="&#106;avascript:${'alert(1)'}">x</a>`,
        () => html`<a href="javascript&colon;${'alert(1)'}">x</a>`,
        () => html`<svg><set attributeName="href" to="${'javascript:alert(1)'}"/></svg>`,
        () => html`<svg><animate attributeName="href" values="${'/a'};${'javascript:alert(1)'}"/></svg>`,
    ];
    for (const render of cases) assert.throws(render, /refusing the URL/, String(render));
});

test('checks each URL attribute on its own', () => {
    assert.equal(markup(html`<a href="${'/a'}" ping="${'/b'}">x</a>`), '<a href="/a" ping="/b">x</a>');
    assert.throws(() => html`<a href="${'/a'}" ping="${'javascript:x'}">x</a>`, /refusing the URL/);
    assert.equal(markup(html`<a href="${'https://example.com'}/p?q=${'javascript:x'}">x</a>`), '<a href="https://example.com/p?q=javascript:x">x</a>');
    assert.equal(markup(html`<svg><animate values="${'0'};${'1'}"/></svg>`), '<svg><animate values="0;1"/></svg>');
});

test('refuses a template that ends inside a tag, a comment or a raw-text element', () => {
    // Nested into another template, an open tag would change what the outer interpolations mean.
    assert.throws(() => html`<a href="${'/x'}`, /must not end inside/);
    assert.throws(() => html`<a class="x"`, /must not end inside/);
    assert.throws(() => html`<script>`, /must not end inside/);
    assert.throws(() => html`<!-- open`, /must not end inside/);
    assert.throws(() => html`<?${'x'}>`, /tag or attribute name/);
    assert.equal(markup(html`<div><p>${'open'}`), '<div><p>open');
});

test('a plain array of strings is analyzed on every call', () => {
    // Tagged templates pass frozen arrays; a plain one could change after its first use.
    const strings = ['<a href="/', '">x</a>'];
    assert.equal(markup(html(strings, 'safe')), '<a href="/safe">x</a>');
    strings[0] = '<a href="';
    assert.throws(() => html(strings, 'javascript:alert(1)'), /refusing the URL/);
});

test('the context analysis is cached per template', () => {
    const render = (value) => html`<p class="${value}">${value}</p>`;
    assert.equal(markup(render('a')), '<p class="a">a</p>');
    assert.equal(markup(render('b')), '<p class="b">b</p>');
});

test('escapeHTML covers the five significant characters', () => {
    assert.equal(escapeHTML(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
