// data-cw-action="like" runs this on click. Hovering or focusing the button
// fetched it already.
export function run({ element }) {
    const pressed = element.getAttribute('aria-pressed') === 'true';
    element.setAttribute('aria-pressed', String(!pressed));
    const count = element.querySelector('.like__count');
    count.textContent = String(Number(count.textContent) + (pressed ? -1 : 1));
}
