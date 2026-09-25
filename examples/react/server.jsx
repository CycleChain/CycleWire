// Server rendering. In a real app your server (Node, or a render service
// next to Laravel or Rails) does this per request; here the examples' build
// does it once and fills the <!--ssr:…--> placeholders in index.html.
import { renderToString } from 'react-dom/server';
import { Counter } from './components/Counter.jsx';

export const render = () => ({
    // The same props the page passes to the island in data-cw-props.
    counter: renderToString(<Counter start={3} />),
});
