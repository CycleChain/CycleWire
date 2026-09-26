// Runs on the field's first focus (cw-on-focusin with cw-once).
// Flatpickr and its stylesheet ({ module, css } in main.js) load only then;
// until then the field is a plain text input that accepts a typed date.
import flatpickr from 'flatpickr';

export function run({ element }) {
    const picker = flatpickr(element, { dateFormat: 'Y-m-d' });
    // The focus that woke this action up has already happened.
    picker.open();
}
