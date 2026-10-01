// The only script the page loads up front: the core, the prefetch plugin and
// cyclewire/request, registered as "request", the action every link and form
// in the page's markup runs to ask the server for HTML. Add to cart, the
// action most visitors use first, runs it, so it comes in this file and a tap
// right after the page appears waits only for the server. The quick view runs
// ./actions/quickview.js, a chunk of its own, which runs request and then
// opens the dialog.
import { start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';
import * as request from 'cyclewire/request';

start({
    actions: {
        request: async () => request,
        quickview: () => import('./actions/quickview.js'),
    },
    plugins: [prefetch()],
});
