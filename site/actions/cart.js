// State the server serialized into <script cw-store="cart">. The badge
// was rendered by the server; bindings only wake up when this runs.
import { store } from 'cyclewire/signals';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const cart = () => store('cart', {
    get count() {
        return this.items.length;
    },
    get total() {
        return money.format(this.items.reduce((sum, item) => sum + item.price, 0));
    },
    get summary() {
        return this.items.length ? this.items.map((item) => item.name).join(', ') : 'Nothing yet.';
    },
    get empty() {
        return this.items.length === 0;
    },
});

export function add({ props }) {
    cart().items.push(props);
}

export function clear() {
    cart().items.splice(0);
}
