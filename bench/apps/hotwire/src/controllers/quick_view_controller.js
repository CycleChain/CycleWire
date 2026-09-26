// The quick view dialog. The Quick view links target the frame inside it
// (data-turbo-frame), so Turbo loads the product into the dialog in place;
// once the frame has loaded, this opens the dialog as a modal. Its Close
// button is a form with method="dialog", which closes it without JavaScript.
import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
    /** On turbo:frame-load. */
    open() {
        // A page requested with ?view= renders the dialog open already, but
        // not as a modal, and showModal() would throw on it.
        if (!this.element.open) this.element.showModal();
    }
}
