// Before any names are generated, every string is an action name.
import { defineAction, registered, run, start, type ActionName, type Context, type PropsOf } from 'cyclewire';
import { earlyScript } from 'cyclewire/early';
import { run as request } from 'cyclewire/request';
import { connect } from 'cyclewire/stream';

const name: ActionName = 'anything#at-all';
run(name);
const names: string[] = registered();

export const handler = defineAction(({ props, element }: Context) => [props.whatever, element.id]);
const loose: PropsOf<'x'> = 42;

// The optional modules, as the docs use them.
start({ actions: { request: () => import('cyclewire/request') } });
// request is a handler like any other, so an action can run it and do more.
export const quickview = defineAction(async (context) => {
    await request(context);
    document.querySelector('dialog')?.showModal();
});
const inline: string = earlyScript('data-cw-');
const close: () => void = connect('wss://example.com/rooms/42/live', { element: document.body });

export { close, inline, loose, names };
