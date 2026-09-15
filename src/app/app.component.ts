import { Component, ChangeDetectionStrategy } from '@angular/core';
import { EmbedHandoffService } from './embed/embed-handoff.service';
import { dismissRuntimeError, RuntimeErrorNotice, runtimeErrorNotice } from './runtime-security/runtime-error.store';

declare var $: any;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent {
  protected readonly dismissRuntimeError = dismissRuntimeError;
  protected readonly runtimeError = runtimeErrorNotice;

  constructor(private embedHandoffService: EmbedHandoffService) {
    void this.embedHandoffService.cleanupExpiredHandoffs().catch(error => {
      console.warn('[Security] Unable to clean up expired partner handoffs.', error);
    });
  }

  protected getRuntimeErrorRole(error: RuntimeErrorNotice): 'alert' | 'status' {
    return error.severity === 'critical' ? 'alert' : 'status';
  }

  protected getRuntimeErrorLiveRegion(error: RuntimeErrorNotice): 'assertive' | 'polite' {
    return error.severity === 'critical' ? 'assertive' : 'polite';
  }
}
