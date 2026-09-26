import { HttpBackend, HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, REQUEST, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { readCart } from '../../../../scenario/cart.js';
import { detail, isCategory, listing, product, search, summary } from '../../../../scenario/catalog.js';

/**
 * The shared JSON API, answered in the server's own process: the server-side
 * HttpBackend (app.config.server.ts). In the browser, HttpClient reaches
 * /api/ through the benchmark's proxy, which sends it to the scenario's shared
 * server; while rendering, the server has no such address, so this answers
 * the same GET requests with the same scenario modules, reading the cart from
 * the request's cookie. Angular's transfer cache writes the answers into the
 * page, and the browser reads them from there while it hydrates.
 */
@Injectable()
export class ScenarioApi implements HttpBackend {
  private readonly cookie = inject(REQUEST)?.headers.get('cookie') ?? undefined;

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const url = request.urlWithParams;
    const body = request.method === 'GET' ? this.answer(new URL(url, 'http://localhost')) : undefined;
    return body === undefined
      ? throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found', url }))
      : of(new HttpResponse({ status: 200, statusText: 'OK', body, url }));
  }

  private answer({ pathname, searchParams }: URL): unknown {
    if (pathname === '/api/products') {
      const category = searchParams.get('category') ?? '';
      const items = search({ q: searchParams.get('q') ?? '', category: isCategory(category) ? category : '' }).map(listing);
      return { count: items.length, items };
    }
    const one = /^\/api\/products\/(p\d{2})$/.exec(pathname);
    if (one) {
      const found = product(one[1]);
      return found ? detail(found) : undefined;
    }
    if (pathname === '/api/cart') {
      const items = readCart(this.cookie);
      return { ...summary(items), items };
    }
    return undefined;
  }
}
