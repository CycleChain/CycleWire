// The one step markup cannot declare: cyclewire/request puts the product into
// the dialog, as the link's cw-target says, and this opens the dialog as a
// modal once it is there. Opening it with an Invoker Command instead would
// show it before the answer arrives (empty, or with the product seen last)
// and would need a button where the page has a link that works without
// JavaScript.
import { run as request } from 'cyclewire/request';

export async function run(context) {
    await request(context);
    const dialog = document.getElementById('quick-view');
    if (dialog.matches(':modal')) return;
    // A page loaded with ?view= shows the dialog open, but not as a modal.
    dialog.close();
    dialog.showModal();
}
