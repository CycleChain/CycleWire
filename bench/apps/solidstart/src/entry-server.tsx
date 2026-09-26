// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

// The starter's document, with the benchmark's shared stylesheet, the page's
// only one, served by its proxy. There is no icon: the proxy answers /favicon.ico.
export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="stylesheet" href="/assets/app.css" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
