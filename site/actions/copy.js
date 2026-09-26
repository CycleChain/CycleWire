// The upgrade pattern: the clipboard needs a user gesture, and a slow first
// import can outlive it in Safari. The first run copies and attaches a direct
// listener; cw-once hands every later click to that listener.
export async function run({ element, signal }) {
    const label = element.querySelector('.copy__label');
    const text = element.dataset.copy;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            flash(label, 'Copied');
        } catch {
            const code = element.parentElement.querySelector('code');
            getSelection()?.selectAllChildren(code);
            flash(label, navigator.platform.startsWith('Mac') ? 'Press ⌘C' : 'Press Ctrl+C');
        }
    };
    await copy();
    element.addEventListener('click', copy, { signal });
}

function flash(label, text) {
    const original = label.dataset.label ||= label.textContent;
    label.textContent = text;
    clearTimeout(label.timer);
    label.timer = setTimeout(() => {
        label.textContent = original;
    }, 1600);
}
