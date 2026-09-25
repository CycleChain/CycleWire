// Sorts a results table by the column whose header button was pressed. Cells
// carry their number in data-value; missing values sort last either way.
export function run({ element }) {
    const header = element.closest('th');
    const table = element.closest('table');
    const index = [...header.parentElement.children].indexOf(header);
    const ascending = header.getAttribute('aria-sort') !== 'ascending';
    for (const other of header.parentElement.children) other.removeAttribute('aria-sort');
    header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');

    const body = table.tBodies[0];
    const value = (row) => {
        const raw = row.children[index]?.getAttribute('data-value');
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
