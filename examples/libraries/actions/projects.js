// Row actions: plain CycleWire actions that know nothing about DataTables or
// jQuery. What they return reaches the page as the cw:done event's
// detail.result, which the page's jQuery code turns into activity entries.
import { post } from '../../shared/server.js';

/** Archived rows by project id. DataTables may have paged a row out of the document, so Undo looks here. */
const archived = new Map();

/** @param {string} action @param {string} id @param {AbortSignal} signal */
const save = (action, id, signal) => post(`/api/projects/${id}/${action}`, new URLSearchParams({ id }), signal);

/** @param {HTMLTableRowElement} row @param {boolean} isArchived */
function mark(row, isArchived) {
    row.classList.toggle('is-archived', isArchived);
    const button = row.querySelector('button');
    button.disabled = isArchived;
    button.textContent = isArchived ? 'Archived' : 'Archive';
}

export async function archive({ element, props, signal }) {
    await save('archive', props.id, signal);
    const row = element.closest('tr');
    archived.set(props.id, row);
    mark(row, true);
    return props;
}

export async function restore({ props, signal }) {
    await save('restore', props.id, signal);
    const row = archived.get(props.id);
    archived.delete(props.id);
    if (row) mark(row, false);
    return props;
}
