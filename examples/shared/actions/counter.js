// A plain CycleWire action. It runs inside a React, Vue or Svelte island
// exactly as it would in server-rendered HTML, and knows nothing about the
// framework: `props` is read from cw-props when the action runs, so it
// always holds what the component rendered last.
import { post } from '../server.js';

export async function save({ props, signal }) {
    await post('/api/counter', new URLSearchParams({ count: String(props.count) }), signal);
    // The return value reaches the page as the `cw:done` event's detail.result.
    return { count: props.count };
}
