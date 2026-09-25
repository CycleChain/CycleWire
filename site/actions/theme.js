export function run({ element }) {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    element.setAttribute('aria-pressed', String(!dark));
    try {
        localStorage.setItem('cw-theme', root.dataset.theme);
    } catch {
        // Private mode or storage disabled: the choice lasts for this page view.
    }
}
