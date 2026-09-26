import { preload, run, type ActionName, type PropsOf } from 'cyclewire';

run('cart#add');
run('cart#clear');
preload('like');
// @ts-expect-error: not an action
run('cart#nope');

const add: PropsOf<'cart#add'> = { sku: 'wire-01' };
// @ts-expect-error: sku is missing
const missing: PropsOf<'cart#add'> = { quantity: 2 };
const like: PropsOf<'like'> = { id: 1 };
const names: ActionName[] = ['cart#add', 'cart#clear', 'like'];

export { add, like, missing, names };
