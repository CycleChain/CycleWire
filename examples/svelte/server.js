// Server rendering. In a real app your server (Node, or a render service
// next to Laravel or Rails) does this per request; here the examples' build
// does it once and fills the <!--ssr:…--> placeholders in index.html.
import { render as renderComponent } from 'svelte/server';
import Counter from './components/Counter.svelte';

export const render = () => ({
    // The same props the page passes to the island in cw-props.
    counter: renderComponent(Counter, { props: { start: 3 } }).body,
});
