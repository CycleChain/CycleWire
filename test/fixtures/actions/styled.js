// Each handler creates the UI its stylesheet styles and records what it
// looked like at that moment: the stylesheet must already apply.
const probe = (parent, className) => {
    const el = document.createElement('span');
    el.className = className;
    parent.append(el);
    return getComputedStyle(el).color;
};

export function run({ element }) {
    window.__log.push({ fn: 'styled', el: element.id, color: probe(element, 'widget') });
}

export function order({ element }) {
    window.__log.push({ fn: 'order', color: probe(element, 'order') });
}

export function shadow({ element }) {
    window.__log.push({ fn: 'shadow', color: probe(element.getRootNode(), 'widget') });
}
