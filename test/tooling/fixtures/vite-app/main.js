import { start } from 'cyclewire';
import actions from 'virtual:cyclewire/actions';

start({ actions });
window.__started = true;
