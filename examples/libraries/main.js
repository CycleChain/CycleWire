import { start } from 'cyclewire';
import { styles } from 'cyclewire/css';

// Each library is imported by the action that uses it, so it becomes a chunk
// the page downloads the first time it is needed. `{ module, css }` entries
// bring a library's stylesheet along, through the styles() plugin.
window.wire = start({
    actions: {
        datepicker: { module: () => import('./actions/datepicker.js'), css: './vendor/flatpickr.min.css' },
        confirm: () => import('./actions/confirm.js'),
        table: { module: () => import('./actions/table.js'), css: './vendor/dataTables.dataTables.min.css' },
        projects: () => import('./actions/projects.js'),
    },
    plugins: [styles()],
});
