// Stays in flight until the spec calls window.__open(<element id>).
export async function run({ element, event, signal }) {
    const id = element.id;
    window.__log.push(['start', id, event ? event.type : null]);
    signal.addEventListener('abort', () => window.__log.push(['abort', id]));
    await window.__wait(id);
    window.__log.push([signal.aborted ? 'end-aborted' : 'end', id]);
}

// Fails the first time it runs for an element, succeeds afterwards.
export async function flaky({ element }) {
    window.__failed ||= new Set();
    if (!window.__failed.has(element.id)) {
        window.__failed.add(element.id);
        window.__log.push(['fail', element.id]);
        throw new Error('first attempt fails');
    }
    window.__log.push(['ok', element.id]);
}
