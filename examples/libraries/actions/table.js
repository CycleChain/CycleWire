// Enhances the server-rendered table when it scrolls into view. DataTables 3
// needs no jQuery, and its stylesheet comes with this module ({ module, css }
// in main.js). The Archive buttons need no setup: DataTables redraws rows as
// you sort, search and page, and CycleWire's delegated listener handles
// whatever rows are on the page.
import DataTable from 'datatables.net-dt';

export function run({ element }) {
    new DataTable(element, { pageLength: 5, lengthChange: false });
}
