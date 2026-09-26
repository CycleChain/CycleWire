import type { Plugin } from 'vite';

export interface Options {
    /** The actions directory, relative to Vite's root. Default: the first of src/actions, resources/js/actions, …, actions. */
    actions?: string;
    /** The declaration file of action names and props to keep up to date, relative to the root, or false. Default: cyclewire-actions.d.ts next to the actions directory. */
    types?: string | false;
    /** Open cyclewire/devtools during development. */
    devtools?: boolean;
    /** Inline cyclewire/early first in index.html's <head>, after <meta charset>, so taps before CycleWire starts are kept. Default: false. */
    early?: boolean;
    /** Warn about unknown actions and invalid values in index.html. Default: true. */
    check?: boolean;
    /** The attribute prefix, as passed to start(). Default: "cw-". */
    prefix?: string;
    /** Where the build writes the manifest `cyclewire check --manifest` reads, inside outDir, or false. Default: .vite/cyclewire.json. */
    manifest?: string | false;
}

/**
 * Registers every file of the actions directory as its own chunk through
 * `virtual:cyclewire/actions`, re-registers an action when its file changes,
 * keeps the declaration file up to date and checks index.html.
 */
export default function cyclewire(options?: Options): Plugin;
