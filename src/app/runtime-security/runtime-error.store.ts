import { signal } from '@angular/core';

export interface RuntimeErrorNotice {
  message: string;
  source: string;
  timestamp: number;
  title: string;
}

const DEFAULT_TITLE = 'Unexpected application error';
const DEFAULT_MESSAGE = 'An unexpected error interrupted MicrobeTrace. Refresh the page and retry the last action.';

export const runtimeErrorNotice = signal<RuntimeErrorNotice | null>(null);

export function reportRuntimeError(options: {
  source: string;
  title?: string;
  message?: string;
}): void {
  const nextNotice: RuntimeErrorNotice = {
    title: options.title ?? DEFAULT_TITLE,
    message: options.message ?? DEFAULT_MESSAGE,
    timestamp: Date.now(),
    source: options.source,
  };

  const currentNotice = runtimeErrorNotice();
  if (
    currentNotice &&
    currentNotice.source === nextNotice.source &&
    currentNotice.title === nextNotice.title &&
    currentNotice.message === nextNotice.message
  ) {
    return;
  }

  runtimeErrorNotice.set(nextNotice);
}

export function dismissRuntimeError(): void {
  runtimeErrorNotice.set(null);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name || 'Error';
    return error.message ? `${name}: ${error.message}` : name;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return 'Non-serializable error object';
    }
  }

  return 'Unknown runtime error';
}
