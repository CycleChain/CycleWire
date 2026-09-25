// Loaded by every fixture page. Actions write what happened to window.__log,
// and window.__wait(id) holds a run open until the spec calls
// window.__open(id), so in-flight states can be tested deterministically
// instead of with timeouts.
window.__log = [];

const gates = new Map();

window.__wait = (id) => new Promise((resolve) => {
    if (!gates.has(id)) gates.set(id, []);
    gates.get(id).push(resolve);
});

window.__open = (id) => {
    const waiting = gates.get(id) || [];
    gates.delete(id);
    waiting.forEach((resolve) => resolve());
    return waiting.length;
};

window.__warnings = [];
const warn = console.warn.bind(console);
console.warn = (...args) => {
    window.__warnings.push(args.map(String).join(' '));
    warn(...args);
};
