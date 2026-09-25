import { start } from 'cyclewire';

// Loader functions let the bundler split every action into a chunk of its
// own. React ships inside the islands chunk, so a page downloads it only when
// an island activates, and never if none does.
window.wire = start({
    actions: {
        islands: () => import('./actions/islands.jsx'),
        counter: () => import('../shared/actions/counter.js'),
    },
});
