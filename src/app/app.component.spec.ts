import { CommonModule } from '@angular/common';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { dismissRuntimeError, reportRuntimeError } from './runtime-security/runtime-error.store';

describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    dismissRuntimeError();

    TestBed.configureTestingModule({
      imports: [
        CommonModule,
        RouterTestingModule
      ],
      declarations: [
        AppComponent
      ],
    }).compileComponents();
  }));

  afterEach(() => {
    dismissRuntimeError();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });

  it('does not show the runtime banner by default', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('.runtime-error-banner')).toBeNull();
  });

  it('renders recoverable runtime issues as warnings with details', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'angular.error', error: new Error('Column metadata could not be read') });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    const banner = compiled.querySelector('.runtime-error-banner');

    expect(banner).not.toBeNull();
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Runtime issue detected');
    expect(banner.textContent).toContain('Summary: Error: Column metadata could not be read');
    expect(banner.textContent).toContain('Source: App component or action');
  });

  it('renders bootstrap failures as warnings', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'bootstrap', error: new Error('Bootstrap failed') });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    const banner = compiled.querySelector('.runtime-error-banner');

    expect(banner).not.toBeNull();
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Runtime issue detected');
    expect(banner.textContent).toContain('Source: Application startup');
  });

  it('dismisses the runtime banner', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'window.error', error: 'Resize observer loop completed' });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    const dismissButton = compiled.querySelector<HTMLButtonElement>('.runtime-error-banner__dismiss');
    dismissButton.click();
    fixture.detectChanges();

    expect(compiled.querySelector('.runtime-error-banner')).toBeNull();
  });
});
