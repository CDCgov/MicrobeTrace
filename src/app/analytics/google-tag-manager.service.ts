import { Inject, Injectable, Optional } from '@angular/core';

type GoogleTagManagerMode = 'silent' | 'noisy';

@Injectable({ providedIn: 'root' })
export class GoogleTagManagerService {
  private loadPromise?: Promise<boolean>;

  constructor(
    @Optional() @Inject('googleTagManagerId') private readonly id: string | null,
    @Optional() @Inject('googleTagManagerMode') private readonly mode: GoogleTagManagerMode | null,
  ) {}

  getDataLayer(): object[] {
    const browserWindow = window as Window & { dataLayer?: object[] };
    browserWindow.dataLayer ??= [];
    return browserWindow.dataLayer;
  }

  addGtmToDom(): Promise<boolean> {
    if (!this.isEnabled()) {
      return Promise.resolve(false);
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    if (document.getElementById('GTMscript')) {
      return Promise.resolve(true);
    }

    this.getDataLayer().push({
      'gtm.start': Date.now(),
      event: 'gtm.js',
    });

    this.loadPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.id = 'GTMscript';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(this.id!)}`;
      script.addEventListener('load', () => resolve(true), { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.insertBefore(script, document.head.firstChild);
    });

    return this.loadPromise;
  }

  async pushTag(item: object): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    this.getDataLayer().push(item);
    await this.addGtmToDom();
  }

  private isEnabled(): boolean {
    if (this.id) {
      return true;
    }

    if (this.mode !== 'silent') {
      console.warn('Google tag manager ID not provided.');
    }
    return false;
  }
}
