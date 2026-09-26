/**
 * The markup the morph speed test works on: 1,000 keyed rows, and the seven
 * operations applied to them. Pure functions, loaded by the test page and by
 * Node (the tests and the results' descriptions).
 *
 * Rows are keyed by `id`, which all three libraries match on by default.
 */
import { prng } from '../../scenario/random.js';

export const ROWS = 1000;

const ADJECTIVES = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy'];
const COLOURS = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black', 'orange'];
const NOUNS = ['table', 'chair', 'house', 'lamp', 'desk', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'];

/**
 * @typedef {{ id: number, label: string }} Row
 */

/** @param {number} count @param {number} [first] @returns {Row[]} */
export function rows(count, first = 1) {
    const random = prng(first);
    const pick = (/** @type {string[]} */ list) => list[Math.floor(random() * list.length)];
    return Array.from({ length: count }, (_, i) => ({ id: first + i, label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}` }));
}

/** @param {Row} row */
export const rowMarkup = ({ id, label }) =>
    `<div class="row" id="row-${id}"><span class="id">${id}</span> <a class="label" href="#row-${id}">${label}</a> <button type="button" class="remove" aria-label="Remove row ${id}">×</button></div>`;

/** Rows as a server writes them: one per line. @param {Row[]} list */
export const listMarkup = (list) => list.map(rowMarkup).join('\n');

/** @param {Row} row */
const cardMarkup = ({ id, label }) => `<section class="card" id="card-${id}"><h3>${label}</h3><p>Card ${id}, in stock.</p></section>`;

/**
 * @typedef {object} Operation
 * @property {string} id
 * @property {string} title
 * @property {Row[] | null} from  the rows the container starts with (null: empty)
 * @property {() => string} to    the target markup
 * @property {() => string[]} kept  ids of the row elements that should stay the same elements
 */

const initial = rows(ROWS);
const ids = (/** @type {Row[]} */ list) => list.map((row) => `row-${row.id}`);

/** @type {Operation[]} */
export const OPERATIONS = [
    {
        id: 'update-every-10th',
        title: "Update every 10th row's text",
        from: initial,
        to: () => listMarkup(initial.map((row, i) => (i % 10 ? row : { ...row, label: `${row.label} !!!` }))),
        kept: () => ids(initial),
    },
    {
        id: 'swap-rows',
        title: 'Swap two rows (the 2nd and the 999th)',
        from: initial,
        to: () => {
            const list = initial.slice();
            [list[1], list[998]] = [list[998], list[1]];
            return listMarkup(list);
        },
        kept: () => ids(initial),
    },
    {
        id: 'prepend-row',
        title: 'Prepend a row',
        from: initial,
        to: () => listMarkup([{ id: ROWS + 1, label: 'new first row' }, ...initial]),
        kept: () => ids(initial),
    },
    {
        id: 'remove-every-other',
        title: 'Remove every other row',
        from: initial,
        to: () => listMarkup(initial.filter((_, i) => i % 2 === 0)),
        kept: () => ids(initial.filter((_, i) => i % 2 === 0)),
    },
    {
        id: 'reverse',
        title: 'Reverse the rows',
        from: initial,
        to: () => listMarkup(initial.slice().reverse()),
        kept: () => ids(initial),
    },
    {
        id: 'replace-structure',
        title: 'Replace the rows with 1,000 cards (other ids, other elements)',
        from: initial,
        to: () => rows(ROWS, ROWS + 1).map(cardMarkup).join('\n'),
        kept: () => [],
    },
    {
        id: 'fill-empty',
        title: 'Fill an empty container with 1,000 rows',
        from: null,
        to: () => listMarkup(initial),
        kept: () => [],
    },
];

/** @param {string} id */
export const operation = (id) => OPERATIONS.find((entry) => entry.id === id);
