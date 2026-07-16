import 'hammerjs';
import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { describeError, reportRuntimeError } from './app/runtime-security/runtime-error.store';
import { installWindowRuntimeHardening } from './app/runtime-security/window-runtime-hardening';

if (environment.production) {
  enableProdMode();
}

installWindowRuntimeHardening({
  allowedMessageOrigins: environment.trustedMessageOrigins,
  production: environment.production,
});

platformBrowserDynamic().bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()], })
  .catch(err => {
    reportRuntimeError({ source: 'bootstrap', error: err, severity: 'critical' });
    console.error(`[RuntimeError] ${describeError(err)}`);
  });
