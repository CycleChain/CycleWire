// The only script the page loads up front: the core and the prefetch plugin.
// cyclewire/request is registered as "request", the action every link and
// form in the page's markup runs to ask the server for HTML; the quick view
// runs ./actions/quickview.js, which runs request and then opens the dialog.
import { start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';

start({
    actions: {
        request: () => import('cyclewire/request'),
        quickview: () => import('./actions/quickview.js'),
    },
    plugins: [prefetch()],
});
