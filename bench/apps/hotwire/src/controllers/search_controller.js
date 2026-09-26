// Live search. The search form targets the results frame (data-turbo-frame),
// so when it is submitted Turbo fetches the results for the query and replaces
// only the frame: the input being typed into is never touched. This controller
// submits the form 200 ms after the last change with requestSubmit(), which,
// unlike submit(), fires the submit event that Turbo handles.
import { Controller } from '@hotwired/stimulus';

/** The scenario's wait after the last key, for stacks that search on the server. */
const DELAY = 200;

export default class extends Controller {
    /** On input: submit once typing pauses. */
    queue() {
        this.cancel();
        this.timeout = setTimeout(() => this.element.requestSubmit(), DELAY);
    }

    /** On submit, by Enter, the button or the timer: nothing is left to send. */
    cancel() {
        clearTimeout(this.timeout);
    }

    disconnect() {
        this.cancel();
    }
}
