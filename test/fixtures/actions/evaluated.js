// Top-level side effect on purpose: it tells a spec when the module was
// evaluated, which modulepreload must not do and a loader function must.
window.__log.push(['evaluated']);

export function run() {
    window.__log.push(['run']);
}
