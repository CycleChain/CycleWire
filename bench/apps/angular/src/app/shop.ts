import { httpResource } from '@angular/common/http';
import { Component, ElementRef, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CATEGORIES, EAGER_IMAGES, categoryName, formatPrice, matches, resultText } from '../../../../scenario/markup.js';
import { AddToCart } from './add-to-cart';
import type { Detail, Products } from './api';
import { Newsletter } from './newsletter';
import { handledByBrowser } from './replay';

/** A query parameter as the router binds it: undefined when it is absent. */
const text = (value: string | undefined) => value ?? '';
/** Unknown categories are ignored, as on the server. */
const knownCategory = (value: string | undefined) => (CATEGORIES.some(({ id }) => id === value) ? (value ?? '') : '');

/**
 * The Wirestore page. Its state is the URL's, as on the server: the search
 * (?q=) and the category (?category=) filter the products in the browser, the
 * quick view shows ?view=, and ?subscribed= and ?newsletter= carry the
 * newsletter's answer after a form post without JavaScript.
 */
@Component({
  selector: 'app-shop',
  imports: [AddToCart, Newsletter, RouterLink],
  templateUrl: './shop.html',
})
export class Shop {
  // Query parameters, bound to inputs by the router (withComponentInputBinding).
  readonly q = input('', { transform: text });
  readonly category = input('', { transform: knownCategory });
  readonly view = input('', { transform: text });
  readonly subscribed = input('', { transform: text });
  readonly newsletter = input('', { transform: text });

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly filters = [{ id: '', name: 'All' }, ...CATEGORIES];
  protected readonly eagerImages = EAGER_IMAGES;
  protected readonly categoryName = categoryName;
  protected readonly formatPrice = formatPrice;
  protected readonly resultText = resultText;

  /** Every product without its description, filtered here as the filters change. */
  private readonly products = httpResource<Products>(() => '/api/products', {
    defaultValue: { count: 0, items: [] },
  });
  protected readonly visible = computed(() =>
    this.products.value().items.filter((product) => matches(product, { q: this.q(), category: this.category() })),
  );

  /** The product whose quick view was last asked for: a new object each time, so asking again reopens it. */
  private readonly asked = signal<{ id: string } | null>(null);
  /** The quick view's product: the one asked for, or the one in ?view=. */
  private readonly shown = computed(() => {
    const id = this.asked()?.id ?? this.view();
    return this.products.value().items.some((product) => product.id === id) ? id : '';
  });
  protected readonly quickView = httpResource<Detail>(() => (this.shown() ? `/api/products/${this.shown()}` : undefined));

  /**
   * The server renders ?view= with the dialog open in the page, which is how
   * it shows without JavaScript. That stands until the browser first opens or
   * closes the dialog; from then on it opens as a modal, with showModal().
   */
  protected readonly inPage = signal(true);
  protected readonly openInPage = computed(() => (this.inPage() && this.quickView.hasValue() ? '' : null));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Opens the dialog once the product asked for has rendered in it.
    afterRenderEffect(() => {
      const asked = this.asked();
      if (!asked || !this.quickView.hasValue() || this.quickView.value().id !== asked.id) return;
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) dialog.showModal();
    });
  }

  /** Results follow the search box: the query goes into the URL, replacing the entry. */
  protected search(query: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: query || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** The results are already shown, so sending the search form only keeps the page. */
  protected searched(event: SubmitEvent): void {
    if (handledByBrowser(event)) return;
    event.preventDefault();
  }

  protected openQuickView(event: MouseEvent, id: string): void {
    // A new tab or window, or a link the browser has already followed.
    if (handledByBrowser(event) || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.inPage.set(false);
    this.asked.set({ id });
  }
}
