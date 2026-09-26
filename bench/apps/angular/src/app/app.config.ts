import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Query parameters reach the page as inputs.
    provideRouter(routes, withComponentInputBinding()),
    // Hydration, with its defaults: incremental hydration, event replay and HttpClient's transfer cache.
    provideClientHydration(),
  ],
};
