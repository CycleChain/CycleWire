// Fetches a server-rendered partial and morphs the list into it. Rows keep
// their identity: type a note, refresh, and it moves with its row.
import { html } from 'cyclewire/dom';
import { morph } from 'cyclewire/morph';

let round = 1;

export async function refresh({ element, signal }) {
    round = (round % 3) + 1;
    const response = await fetch(`./partials/board-${round}.html`, { signal });
    await morph(document.getElementById('board'), html.raw(await response.text()), { transition: true });
    element.querySelector('.board__round').textContent = `${round}/3`;
}
