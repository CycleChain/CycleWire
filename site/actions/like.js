// Fetched when someone reaches for a like button (hover, focus or touch),
// run when they click it.
export function run({ element }) {
    const count = element.querySelector('.like__count');
    const pressed = element.getAttribute('aria-pressed') === 'true';
    element.setAttribute('aria-pressed', String(!pressed));
    count.textContent = String(Number(count.textContent) + (pressed ? -1 : 1));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.querySelector('svg')?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
            { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' },
        );
    }
}
