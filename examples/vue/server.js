// Server rendering. In a real app your server (Node, or a render service
// next to Laravel or Rails) does this per request; here the examples' build
// does it once and fills the <!--ssr:…--> placeholders in index.html.
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import Counter from './components/Counter.vue';

export const render = async () => ({
    // The same props the page passes to the island in cw-props.
    counter: await renderToString(createSSRApp(Counter, { start: 3 })),
});
