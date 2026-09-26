import { HttpClient, httpResource } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import type { CartState } from './api';

/**
 * The cart, which lives in the `cart` cookie. The server renders it from the
 * cookie; the browser reads that answer from the page (HttpClient's transfer
 * cache) and then keeps what the shared API returns after each addition.
 */
@Service()
export class Cart {
  private readonly http = inject(HttpClient);
  private readonly state = httpResource<CartState>(() => '/api/cart', {
    defaultValue: { count: 0, total: 0, items: {} },
  });

  readonly count = computed(() => this.state.value().count);
  /** In cents. */
  readonly total = computed(() => this.state.value().total);

  /** Adds one of a product; the API sets the cookie and answers with the new cart. */
  add(id: string): void {
    this.http.post<CartState>('/api/cart', { id }).subscribe((cart) => this.state.set(cart));
  }
}
