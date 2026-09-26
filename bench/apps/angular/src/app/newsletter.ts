import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, linkedSignal } from '@angular/core';
import { INVALID_EMAIL, thanks } from '../../../../scenario/markup.js';
import type { Message } from './api';
import { handledByBrowser } from './replay';

/**
 * The newsletter sign-up. Without JavaScript the form posts to /newsletter,
 * and the server redirects to the page with ?subscribed= or
 * ?newsletter=invalid, which the page passes in; once hydrated, the form
 * sends the address to the shared API and shows the answer in place.
 */
@Component({
  selector: 'app-newsletter',
  templateUrl: './newsletter.html',
})
export class Newsletter {
  /** The address in ?subscribed=, after a form post without JavaScript. */
  readonly subscribed = input('');
  /** Whether the page has ?newsletter=invalid, after a rejected post. */
  readonly invalid = input(false);

  private readonly http = inject(HttpClient);

  /** The server's message: from the redirect's address, then from the API. */
  protected readonly status = linkedSignal(() =>
    this.subscribed() ? thanks(this.subscribed()) : this.invalid() ? INVALID_EMAIL : '',
  );

  protected subscribe(event: SubmitEvent, email: string): void {
    if (handledByBrowser(event)) return;
    event.preventDefault();
    this.http.post<Message>('/api/newsletter', { email }).subscribe({
      next: ({ message }) => this.status.set(message),
      // 422, with the reason as its message
      error: (error: HttpErrorResponse) => this.status.set((error.error as Message | null)?.message ?? INVALID_EMAIL),
    });
  }
}
