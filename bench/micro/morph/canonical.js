/**
 * A canonical text form of a node's children, for comparing markup the way
 * people read it: attributes sorted (their order means nothing), namespaces
 * spelled out (an SVG `rect` is not an HTML `rect`, and an `xlink:href` in the
 * XLink namespace is not a plain attribute that happens to have a colon),
 * `<template>` contents included, and adjacent text nodes merged (text is
 * simply concatenated). Runs in the page.
 */
const HTML = 'http://www.w3.org/1999/xhtml';

/** @param {Node} parent @returns {string} */
export function canonical(parent) {
    let out = '';
    for (let node = parent.firstChild; node; node = node.nextSibling) out += form(node);
    return out;
}

/** @param {Node} node @returns {string} */
function form(node) {
    if (node.nodeType === 3) return /** @type {Text} */ (node).data.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (node.nodeType === 8) return `<!--${/** @type {Comment} */ (node).data}-->`;
    if (node.nodeType !== 1) return '';
    const el = /** @type {Element} */ (node);
    const name = el.namespaceURI === HTML ? el.localName : `{${el.namespaceURI}}${el.localName}`;
    const attributes = [...el.attributes]
        .map((attribute) => ` ${attribute.namespaceURI ? `{${attribute.namespaceURI}}` : ''}${attribute.localName}=${JSON.stringify(attribute.value)}`)
        .sort()
        .join('');
    const content = el.localName === 'template' && el.namespaceURI === HTML ? `{content}${canonical(/** @type {HTMLTemplateElement} */ (el).content)}{/content}` : '';
    return `<${name}${attributes}>${content}${canonical(el)}</${name}>`;
}

/**
 * Where two canonical forms first differ, with some context, or null.
 * @param {string} actual @param {string} expected
 */
export function difference(actual, expected) {
    if (actual === expected) return null;
    let i = 0;
    while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
    const around = (/** @type {string} */ text) => JSON.stringify(text.slice(Math.max(0, i - 40), i + 60));
    return `differs at character ${i}: got ${around(actual)}, expected ${around(expected)}`;
}
