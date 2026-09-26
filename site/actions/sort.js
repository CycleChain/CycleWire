// Sorts a results table by the column whose header button was pressed. Cells
// carry their number in data-value; missing values sort last either way. A
// header that spans two rows names its column in data-column.
export function run({ element }) {
    const header = element.closest('th');
    const table = element.closest('table');
    const column = Number(header.dataset.column ?? header.cellIndex);
    const ascending = header.getAttribute('aria-sort') !== 'ascending';
    for (const other of table.tHead.querySelectorAll('th[aria-sort]')) other.removeAttribute('aria-sort');
    header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');

    const body = table.tBodies[0];
    const value = (row) => {
        const raw = row.cells[column]?.getAttribute('data-value');
        return raw === null || raw === undefined || raw === '' ? null : Number(raw);
    };
    const rows = [...body.rows].sort((a, b) => {
        const x = value(a);
        const y = value(b);
        if (x === null || y === null) return (x === null) - (y === null);
        return ascending ? x - y : y - x;
    });
    body.append(...rows);
}
