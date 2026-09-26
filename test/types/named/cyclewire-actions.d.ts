// What `cyclewire types` generates: every action by name, mapped to its handler.
interface CycleWireActions {
    'cart#add': typeof import('./actions/cart.js').add;
    'cart#clear': typeof import('./actions/cart.js').clear;
}
