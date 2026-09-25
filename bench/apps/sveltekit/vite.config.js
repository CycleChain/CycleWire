// The configuration `npx sv create` writes (SvelteKit's options passed to its
// Vite plugin), with adapter-node for a standalone Node server: `vite build`,
// then `node build`.
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter(),
			alias: {
				// The scenario's shared modules (catalog, cart, markup), outside this app's folder.
				$scenario: '../../scenario'
			}
		})
	],
	// The dev server needs leave to serve those modules; the build bundles them either way.
	server: { fs: { allow: ['../../scenario'] } }
});
