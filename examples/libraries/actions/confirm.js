// Asks before a destructive action. SweetAlert2 loads on the first submit;
// its default build injects its own stylesheet.
import Swal from 'sweetalert2';
import { post } from '../../shared/server.js';

export async function run({ element, props, signal }) {
    const { isConfirmed } = await Swal.fire({
        title: props.title,
        text: props.text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: props.confirm,
        focusCancel: true,
    });
    if (!isConfirmed) return;
    // Send the form in the background and stay on the page. To let the browser
    // navigate instead, call element.submit(): it posts without firing another
    // submit event, so the user is not asked twice (requestSubmit() would run
    // this action again).
    await post(element.action, new FormData(element), signal);
    const done = document.createElement('p');
    done.setAttribute('role', 'status');
    done.textContent = props.done;
    element.replaceWith(done);
}
