import { preload, run, type ActionName, type PropsOf } from 'cyclewire';

const name: ActionName = 'cart#add';
// @ts-expect-error: not a registered action
const unknown: ActionName = 'cart#remove';

run('cart#add');
preload('cart#clear');
// @ts-expect-error: not a registered action
run('cart#remove');

const props: PropsOf<'cart#add'> = { sku: 'wire-01' };
// @ts-expect-error: sku is required
const missing: PropsOf<'cart#add'> = { quantity: 1 };

export { missing, name, props, unknown };
