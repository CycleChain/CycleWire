// An `idle` trigger: once the page has settled, keep a live list of every
// script and stylesheet it downloaded, and whether it came at boot or on demand.
export function run({ element, signal }) {
    const list = element.querySelector('.network__list');
    const total = element.querySelector('.network__total');
    const navigation = performance.getEntriesByType('navigation')[0];
    const boot = navigation ? navigation.domContentLoadedEventEnd || navigation.responseEnd : 0;
    const seen = new Set();
    let bytes = 0;

    const span = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text });

    const add = (entry) => {
        const url = new URL(entry.name);
        if (!/\.(?:js|css)$/.test(url.pathname) || seen.has(url.pathname)) return;
        seen.add(url.pathname);
        const size = entry.encodedBodySize || entry.decodedBodySize || 0;
        bytes += size;
        const name = url.pathname.split('/').pop();
        const early = entry.startTime <= boot;
        const when = early ? 'at boot' : 'on demand';
        const weight = size ? `${(size / 1000).toFixed(1)} kB` : 'cached';

        const item = document.createElement('li');
        item.className = early ? 'file file--boot' : 'file';
        item.title = `${name} · ${when} · ${weight}`;
        const dot = span(early ? 'dot dot--boot' : 'dot', '');
        dot.setAttribute('aria-hidden', 'true');
        const code = document.createElement('code');
        code.textContent = name;
        item.append(dot, code, span('file__size', weight), span('sr-only', `, ${when}`));
        list.append(item);
        total.textContent = `${seen.size} ${seen.size === 1 ? 'file' : 'files'} · ${(bytes / 1000).toFixed(1)} kB transferred`;
    };

    list.replaceChildren();
    const observer = new PerformanceObserver((entries) => entries.getEntries().forEach(add));
    observer.observe({ type: 'resource', buffered: true });
    signal.addEventListener('abort', () => observer.disconnect());
}
