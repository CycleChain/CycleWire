// Actions for the signals specs: they change state; bindings do the DOM work.
export function inc({ state }) {
    state.count++;
}

export function toggle({ state }) {
    state.open = !state.open;
}

export function add({ store, props }) {
    const cart = store('cart', {
        get count() {
            return this.items.length;
        },
        get total() {
            return this.items.reduce((sum, item) => sum + item.price, 0);
        },
    });
    cart.items.push(props);
}
