import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

/** Ρυθμίσεις της εφαρμογής που διαβάζει το main.ts: ενεργοποιεί το HttpClient (με fetch) για τα αιτήματα στο Open-Meteo. */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(withFetch())],
};
