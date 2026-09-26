// Mounts Svelte islands. CycleWire decides when (cw-trigger on the
// island's element); this module, Svelte's runtime and the component are
// downloaded only then.
import { hydrate, unmount } from 'svelte';
import { removed } from '../../shared/removed.js';
import Counter from '../components/Counter.svelte';

export function counter({ element, props }) {
    // The server rendered <Counter> with these same props, so Svelte hydrates
    // that HTML instead of rendering it again. Without server rendering, use
    // mount(Counter, { target: element, props }).
    const island = hydrate(Counter, { target: element, props });
    removed(element).then(() => unmount(island));
}
