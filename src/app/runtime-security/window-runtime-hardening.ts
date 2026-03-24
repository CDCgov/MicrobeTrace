import { describeError, reportRuntimeError } from './runtime-error.store';

export interface WindowRuntimeHardeningOptions {
  allowedMessageOrigins?: string[];
  production?: boolean;
}

let runtimeHardeningInstalled = false;
const blockedMessageOrigins = new Set<string>();

export function installWindowRuntimeHardening(options: WindowRuntimeHardeningOptions = {}): void {
  if (runtimeHardeningInstalled || typeof window === 'undefined') {
    return;
  }

  runtimeHardeningInstalled = true;

  const allowedOrigins = new Set(
    (options.allowedMessageOrigins ?? [])
      .map(origin => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin))
  );
  const currentOrigin = normalizeOrigin(window.location.origin);

  if (currentOrigin) {
    allowedOrigins.add(currentOrigin);
  }

  if (window.location.protocol === 'file:') {
    allowedOrigins.add('null');
  }

  // Capture unexpected cross-origin window messages before any library listener can consume them.
  window.addEventListener('message', (event: MessageEvent) => {
    if (isAllowedOrigin(event.origin, allowedOrigins)) {
      return;
    }

    event.stopImmediatePropagation();

    const blockedOrigin = normalizeOrigin(event.origin) ?? 'unknown';
    if (!blockedMessageOrigins.has(blockedOrigin)) {
      blockedMessageOrigins.add(blockedOrigin);
      console.warn(`[Security] Blocked cross-origin window message from ${blockedOrigin}.`);
    }
  }, true);

  window.addEventListener('error', (event: ErrorEvent) => {
    reportRuntimeError({ source: 'window.error' });
    console.error(`[RuntimeError] ${describeError(event.error ?? event.message)}`);

    if (options.production) {
      event.preventDefault();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportRuntimeError({ source: 'window.unhandledrejection' });
    console.error(`[RuntimeError] ${describeError(event.reason)}`);

    if (options.production) {
      event.preventDefault();
    }
  });
}

function isAllowedOrigin(origin: string, allowedOrigins: Set<string>): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin !== undefined && allowedOrigins.has(normalizedOrigin);
}

function normalizeOrigin(origin?: string | null): string | undefined {
  if (!origin) {
    return undefined;
  }

  if (origin === 'null') {
    return 'null';
  }

  return origin.replace(/\/$/, '');
}
