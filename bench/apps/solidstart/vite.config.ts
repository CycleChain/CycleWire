import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import { nitro } from "nitro/vite";

import { solidStart } from "@solidjs/start/config";

/**
 * SolidStart 2.0.5 imports its development toolbar into the error boundary it
 * also renders in production. The toolbar component is dropped from production
 * builds, as the docs say, but the stylesheets its modules import are side
 * effects the bundler keeps, so every page would link 17 kB of toolbar styles
 * that match nothing on it. Declaring the toolbar module free of side effects
 * lets the build drop it, and its stylesheets, whenever it is not used.
 */
function withoutDevToolbar(): Plugin {
  return {
    name: "wirestore:without-dev-toolbar",
    apply: "build",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source !== "./dev-toolbar/index.jsx" || !importer || !/@solidjs[\\/]start[\\/]dist[\\/]shared[\\/]/.test(importer)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && { ...resolved, moduleSideEffects: false };
    },
  };
}

// The starter's configuration, SolidStart's plugin and then Nitro's, whose
// default preset builds a standalone Node server (`node .output/server/index.mjs`),
// with the plugin above.
export default defineConfig({
  plugins: [solidStart(), nitro(), withoutDevToolbar()],
  resolve: {
    alias: {
      // The benchmark's shared modules in bench/scenario/, two folders up: the
      // server functions read the catalog and the cart from them, and the
      // components format prices and match queries with the same functions.
      "#scenario": fileURLToPath(new URL("../../scenario", import.meta.url)),
    },
  },
  // The dev server needs leave to serve those modules to the browser; the build bundles them either way.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../../scenario"] } },
});
