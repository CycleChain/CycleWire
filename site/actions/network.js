// An `idle` trigger: once the page has settled, keep a live list of every
// script and stylesheet it downloaded, and whether it came at boot or on demand.
export function run({ element, signal }) {
    const list = element.querySelector('.network__list');
    const total = element.querySelector('.network__total');
    const navigation = performance.getEntriesByType('navigation')[0];
    const boot = navigation ? navigation.domContentLoadedEventEnd || navigation.responseEnd : 0;
    const seen = new Set();
    let bytes = 0;

    const add = (entry) => {
        const url = new URL(entry.name);
        if (!/\.(?:js|css)$/.test(url.pathname) || seen.has(url.pathname)) return;
        seen.add(url.pathname);
        const size = entry.encodedBodySize || entry.decodedBodySize || 0;
        bytes += size;
        const item = document.createElement('li');
        const name = document.createElement('code');
        name.textContent = url.pathname.split('/').pop();
        const when = document.createElement('span');
        const early = entry.startTime <= boot;
        when.className = early ? 'tag tag--boot' : 'tag tag--demand';
        when.textContent = early ? 'at boot' : 'on demand';
        const weight = document.createElement('span');
        weight.className = 'network__size';
        weight.textContent = size ? `${(size / 1000).toFixed(1)} kB` : 'cached';
        item.append(name, when, weight);
        list.append(item);
        total.textContent = `${seen.size} ${seen.size === 1 ? 'file' : 'files'} · ${(bytes / 1000).toFixed(1)} kB transferred`;
    };

    list.replaceChildren();
    const observer = new PerformanceObserver((entries) => entries.getEntries().forEach(add));
    observer.observe({ type: 'resource', buffered: true });
    signal.addEventListener('abort', () => observer.disconnect());
}
