import { HttpBackend } from '@angular/common/http';
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ScenarioApi } from './scenario-api';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // On the server, HttpClient's requests to the shared API are answered in-process.
    { provide: HttpBackend, useClass: ScenarioApi },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
