import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { formatPrice } from '../../../../scenario/markup.js';
import { Cart } from './cart';

/** The layout every route shares: the header with the cart, and the footer. */
@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly cart = inject(Cart);
  protected readonly formatPrice = formatPrice;
}
