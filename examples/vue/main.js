import { start } from 'cyclewire';

// Loader functions let the bundler split every action into a chunk of its
// own. Vue ships inside the islands chunk, so a page downloads it only when
// an island activates, and never if none does.
window.wire = start({
    actions: {
        islands: () => import('./actions/islands.js'),
        counter: () => import('../shared/actions/counter.js'),
    },
});
