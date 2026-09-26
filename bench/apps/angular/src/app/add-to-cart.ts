import { Directive, inject, input } from '@angular/core';
import { Cart } from './cart';
import { handledByBrowser } from './replay';

/**
 * Enhances an "Add to cart" form. The form posts to /cart by itself, which
 * the server handles without JavaScript; once the page has hydrated, this
 * adds the product through the cart instead and the page stays as it is.
 */
@Directive({
  selector: 'form[appAddToCart]',
  host: { '(submit)': 'submit($event)' },
})
export class AddToCart {
  /** The product's id. */
  readonly product = input.required<string>({ alias: 'appAddToCart' });

  private readonly cart = inject(Cart);

  protected submit(event: SubmitEvent): void {
    if (handledByBrowser(event)) return;
    event.preventDefault();
    this.cart.add(this.product());
  }
}
