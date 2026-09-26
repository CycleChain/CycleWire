import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { add, cartCookie, readCart } from '../../../scenario/cart.js';
import { back } from '../../../scenario/http.js';
import { validEmail } from '../../../scenario/markup.js';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
/**
 * The benchmark's proxy terminates TLS in front of this server and says so in
 * X-Forwarded-Proto, X-Forwarded-Host and X-Forwarded-For. Angular drops proxy
 * headers it is not told to trust, with a warning on every request; the hosts
 * it accepts are listed in angular.json (security.allowedHosts).
 */
const angularApp = new AngularNodeAppEngine({
  trustProxyHeaders: ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'],
});

/**
 * The page's two forms post here when the browser sends them itself: without
 * JavaScript, or before the app has hydrated. Once it has, the app sends them
 * to the shared JSON API instead. Each answers with a redirect back to a page,
 * as the scenario's reference server does, so reloading does not post again.
 */
const form = express.urlencoded({ extended: false });

app.post('/cart', form, (req, res) => {
  const next = add(readCart(req.headers.cookie), String(req.body?.id ?? ''));
  if (!next) {
    res.status(404).type('text').send('No such product');
    return;
  }
  res.setHeader('Set-Cookie', cartCookie(next));
  res.redirect(303, back(req));
});

app.post('/newsletter', form, (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  res.redirect(303, validEmail(email) ? `/?subscribed=${encodeURIComponent(email)}` : '/?newsletter=invalid');
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000,
 * and on the address in `HOST`, or 127.0.0.1.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 4000);
  const host = process.env['HOST'] || '127.0.0.1';
  app.listen(port, host, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://${host}:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
