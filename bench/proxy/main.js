/**
 * Runs the shared server and one proxy listener per stack in their own
 * process, so compression never competes with the runner for its event loop.
 * Started by runner/stacks.js with fork(); send it
 *
 *   { stacks: [{ id, upstream: <port>, listen: <port> }] }
 *
 * and it answers { ready: true, shared: <port> } once everything listens.
 */
import { once } from 'node:events';
import { certificate } from './cert.js';
import { createProxy } from './server.js';
import { SHARED, createShared } from '../scenario/shared.js';

process.once('message', async ({ stacks }) => {
    const { key, cert } = certificate();
    const shared = createShared().listen(0, '127.0.0.1');
    await once(shared, 'listening');
    const sharedPort = /** @type {import('node:net').AddressInfo} */ (shared.address()).port;

    for (const stack of stacks) {
        const proxy = createProxy({ key, cert, route: (pathname) => ({ port: SHARED.test(pathname) ? sharedPort : stack.upstream }) });
        proxy.listen(stack.listen, '127.0.0.1');
        await once(proxy, 'listening');
    }
    process.send?.({ ready: true, shared: sharedPort });
});

process.on('disconnect', () => process.exit(0));
