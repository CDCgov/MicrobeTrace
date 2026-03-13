import { ErrorHandler, Injectable } from '@angular/core';
import { describeError, reportRuntimeError } from './runtime-error.store';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    reportRuntimeError({ source: 'angular.error' });
    console.error(`[RuntimeError] ${describeError(error)}`);
  }
}
