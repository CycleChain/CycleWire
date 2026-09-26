import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Every page is rendered on the server for each request: the header shows the
 * visitor's cart, from a cookie. Nothing is prerendered.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
