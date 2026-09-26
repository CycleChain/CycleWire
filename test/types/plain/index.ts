// Before any names are generated, every string is an action name.
import { defineAction, registered, run, type ActionName, type Context, type PropsOf } from 'cyclewire';

const name: ActionName = 'anything#at-all';
run(name);
const names: string[] = registered();

export const handler = defineAction(({ props, element }: Context) => [props.whatever, element.id]);
const loose: PropsOf<'x'> = 42;

export { loose, names };
