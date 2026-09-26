// The next app's config. Its turbopack.root is bench/, which that file works
// out from its own folder, two levels up, as it would from this one: the root
// takes in bench/scenario/, and apps/next/, whose files this app imports.
export { default } from '../next/next.config.mjs';
