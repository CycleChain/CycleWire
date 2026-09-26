// Mounts Vue islands. CycleWire decides when (cw-trigger on the
// island's element); this module, Vue and the component are downloaded only
// then.
import { createSSRApp } from 'vue';
import { removed } from '../../shared/removed.js';
import Counter from '../components/Counter.vue';

export function counter({ element, props }) {
    // The server rendered <Counter> with these same props, so mounting an SSR
    // app hydrates that HTML instead of rendering it again. Without server
    // rendering, use createApp(Counter, props).mount(element).
    const app = createSSRApp(Counter, props);
    app.mount(element);
    removed(element).then(() => app.unmount());
}
