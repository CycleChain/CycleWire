/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point, in all cases the application is rendered outside the browser, this
 * entry point will be the common one.
 *
 * - Server (express, cloudflare...)
 * - npm run start
 * - npm run preview
 * - npm run build
 *
 * The render options are the defaults: the Qwik Loader as a module script, and the
 * preloader, which adds <link rel="modulepreload"> for the code the page is likely to run.
 */
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: "en",
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
