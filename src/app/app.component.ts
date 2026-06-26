import { Component } from '@angular/core';
import { dismissRuntimeError, RuntimeErrorNotice, runtimeErrorNotice } from './runtime-security/runtime-error.store';

declare var $: any;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  protected readonly dismissRuntimeError = dismissRuntimeError;
  protected readonly runtimeError = runtimeErrorNotice;

  protected getRuntimeErrorRole(error: RuntimeErrorNotice): 'alert' | 'status' {
    return error.severity === 'critical' ? 'alert' : 'status';
  }

  protected getRuntimeErrorLiveRegion(error: RuntimeErrorNotice): 'assertive' | 'polite' {
    return error.severity === 'critical' ? 'assertive' : 'polite';
  }
}
