// Runs for a <form> inside a declarative shadow root. submit does not cross
// the shadow boundary, so the page starts CycleWire with { shadow: true }.
export function greet({ element }) {
    const name = String(new FormData(element).get('name') || '').trim() || 'there';
    element.getRootNode().querySelector('output').textContent = `Hello, ${name}! This ran inside a shadow root.`;
}
