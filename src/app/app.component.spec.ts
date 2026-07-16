import { CommonModule } from '@angular/common';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { EmbedHandoffService } from './embed/embed-handoff.service';
import { dismissRuntimeError, reportRuntimeError } from './runtime-security/runtime-error.store';

describe('AppComponent', () => {
  let embedHandoffServiceStub: { cleanupExpiredHandoffs: jasmine.Spy };

  beforeEach(waitForAsync(() => {
    dismissRuntimeError();
    embedHandoffServiceStub = {
      cleanupExpiredHandoffs: jasmine.createSpy('cleanupExpiredHandoffs').and.resolveTo({ scanned: 0, removed: 0, errors: 0 }),
    };

    TestBed.configureTestingModule({
      imports: [
        CommonModule,
        RouterTestingModule
      ],
      declarations: [
        AppComponent
      ],
      providers: [
        { provide: EmbedHandoffService, useValue: embedHandoffServiceStub },
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

  it('cleans up expired partner handoffs on startup', () => {
    TestBed.createComponent(AppComponent);

    expect(embedHandoffServiceStub.cleanupExpiredHandoffs).toHaveBeenCalled();
  });

  it('does not show the runtime banner by default', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('.runtime-error-banner')).toBeNull();
  });

  it('does not render recoverable runtime warnings as banners', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'angular.error', error: new RangeError('Maximum call stack size exceeded') });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('.runtime-error-banner')).toBeNull();
    expect(compiled.textContent).not.toContain('Maximum call stack size exceeded');
  });

  it('renders application-breaking runtime issues as critical banners', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'bootstrap', error: new Error('Bootstrap failed'), severity: 'critical' });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    const banner = compiled.querySelector('.runtime-error-banner');

    expect(banner).not.toBeNull();
    expect(banner.getAttribute('data-severity')).toBe('critical');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('Application startup error');
    expect(banner.textContent).toContain('Source: Application startup');
  });

  it('dismisses the runtime banner', () => {
    const fixture = TestBed.createComponent(AppComponent);
    reportRuntimeError({ source: 'window.error', error: 'Startup failed after route activation', severity: 'critical' });
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.debugElement.nativeElement;
    const dismissButton = compiled.querySelector<HTMLButtonElement>('.runtime-error-banner__dismiss');
    dismissButton.click();
    fixture.detectChanges();

    expect(compiled.querySelector('.runtime-error-banner')).toBeNull();
  });
});
