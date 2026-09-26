// Runs as you type, 100 ms after the last key (data-cw-debounce="100"), and
// shows only the items that match.
export function run({ element, props }) {
    const query = element.value.trim().toLowerCase();
    const items = [...document.getElementById(props.list).children];
    let shown = 0;
    for (const item of items) {
        item.hidden = !item.textContent.toLowerCase().includes(query);
        if (!item.hidden) shown++;
    }
    document.getElementById(`${props.list}-count`).textContent = `${shown} of ${items.length}`;
}
