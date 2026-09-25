// The only script the page loads up front: the core, with one loader per file
// in ./actions/, so each action becomes its own chunk (./actions/cart.js is
// "cart", and so on).
import { fromGlob, start } from 'cyclewire';

start({ actions: fromGlob(import.meta.glob('./actions/*.js')) });
