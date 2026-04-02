import { ErrorHandler, Injectable } from '@angular/core';
import { describeError, reportRuntimeError } from './runtime-error.store';
import { shouldIgnoreRuntimeError } from './runtime-error-filter';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (shouldIgnoreRuntimeError(error, { source: 'angular.error' })) {
      return;
    }

    reportRuntimeError({ source: 'angular.error' });
    console.error(`[RuntimeError] ${describeError(error)}`);
  }
}
