// The CycleWire app's entry, with every action's code loaded on intent only:
// preload: 'intent' turns off the look-ahead that, on touch screens, fetches
// the code of actions in view once the page is idle.
import { fromGlob, start } from 'cyclewire';
import { prefetch } from 'cyclewire/prefetch';

const ACTIONS = '../../cyclewire/src/actions/';

start({ actions: fromGlob(import.meta.glob('../../cyclewire/src/actions/*.js'), ACTIONS), plugins: [prefetch()], preload: 'intent' });
