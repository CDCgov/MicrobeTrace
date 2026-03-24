import { Component } from '@angular/core';
import {} from '@angular/common/http';
import { dismissRuntimeError, runtimeErrorNotice } from './runtime-security/runtime-error.store';

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
}

