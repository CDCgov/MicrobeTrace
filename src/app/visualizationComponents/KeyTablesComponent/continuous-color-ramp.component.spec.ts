import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { createDefaultVariableColorScaleConfig, resolveVariableColorScale } from '@app/contactTraceCommonServices/variable-color-scale';
import { ContinuousColorRampComponent } from './continuous-color-ramp.component';

describe('ContinuousColorRampComponent', () => {
  function buildComponent(): ContinuousColorRampComponent {
    const component = new ContinuousColorRampComponent();
    component.editable = true;
    component.config = {
      mode: 'continuous',
      domain: { kind: 'custom', min: 0, max: 10 },
      stops: [
        { value: 0, color: '#000000' },
        { value: 2, color: '#ff0000' },
        { value: 10, color: '#ffffff' },
      ],
      missingColor: '#eae553',
    };
    component.resolved = resolveVariableColorScale([{ value: 0 }, { value: 10 }], 'value', component.config);
    return component;
  }

  it('describes its domain, stops, and missing-value color for assistive technology', () => {
    const component = buildComponent();

    expect(component.description).toContain('from 0 to 10');
    expect(component.description).toContain('2 #ff0000');
    expect(component.description).toContain('#eae553');
  });

  it('adds a stop at the midpoint of the largest gap using the active ramp color', () => {
    const component = buildComponent();
    let emitted;
    component.configChange.subscribe(value => { emitted = value; });

    component.addStop();

    expect(emitted.stops.map(stop => stop.value)).toEqual([0, 2, 6, 10]);
    expect(emitted.stops[2].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('reverses colors without changing stop values', () => {
    const component = buildComponent();
    let emitted;
    component.configChange.subscribe(value => { emitted = value; });

    component.reverseStops();

    expect(emitted.stops.map(stop => stop.value)).toEqual([0, 2, 10]);
    expect(emitted.stops.map(stop => stop.color)).toEqual(['#ffffff', '#ff0000', '#000000']);
  });

  it('blocks invalid custom bounds and protects endpoint stops', () => {
    const component = buildComponent();
    const emitted = jasmine.createSpy('configChange');
    component.configChange.subscribe(emitted);

    component.onDomainBoundChange('min', 12);
    component.removeStop(0);

    expect(component.validationMessage).toContain('below maximum');
    expect(emitted).not.toHaveBeenCalled();
  });

  it('switches back to the automatic full-data domain', () => {
    const component = buildComponent();
    let emitted = createDefaultVariableColorScaleConfig();
    component.configChange.subscribe(value => { emitted = value; });

    component.onDomainKindChange('auto');

    expect(emitted.domain).toEqual({ kind: 'auto' });
    expect(emitted.mode).toBe('continuous');
  });

  it('commits color-picker changes only after the picker selection is finished', async () => {
    await TestBed.configureTestingModule({
      declarations: [ContinuousColorRampComponent],
      imports: [FormsModule, SelectModule],
    }).compileComponents();
    const fixture: ComponentFixture<ContinuousColorRampComponent> = TestBed.createComponent(ContinuousColorRampComponent);
    const component = fixture.componentInstance;
    const configured = buildComponent();
    component.editable = configured.editable;
    component.config = configured.config;
    component.resolved = configured.resolved;
    fixture.detectChanges();

    const colorInput = fixture.nativeElement.querySelector('.continuous-ramp__stop-row input[type="color"]') as HTMLInputElement;
    const missingColorInput = fixture.nativeElement.querySelector('#continuous-color-ramp-missing-color') as HTMLInputElement;
    const minInput = fixture.nativeElement.querySelector('.continuous-ramp__bounds input') as HTMLInputElement;
    const stopInput = fixture.nativeElement.querySelectorAll('.continuous-ramp__stop-row input[type="number"]')[1] as HTMLInputElement;
    const colorChange = spyOn(component, 'onStopColorChange');
    const missingColorChange = spyOn(component, 'onMissingColorChange');
    const boundChange = spyOn(component, 'onDomainBoundChange');
    const stopChange = spyOn(component, 'onStopValueChange');
    minInput.value = '-20';
    minInput.dispatchEvent(new Event('input', { bubbles: true }));
    stopInput.value = '3';
    stopInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    missingColorInput.value = '#654321';
    missingColorInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(colorChange).not.toHaveBeenCalled();
    expect(missingColorChange).not.toHaveBeenCalled();
    expect(boundChange).not.toHaveBeenCalled();
    expect(stopChange).not.toHaveBeenCalled();

    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    missingColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    minInput.dispatchEvent(new Event('change', { bubbles: true }));
    stopInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(colorChange).toHaveBeenCalledOnceWith(0, '#123456');
    expect(missingColorChange).toHaveBeenCalledOnceWith('#654321');
    expect(boundChange).toHaveBeenCalledOnceWith('min', '-20');
    expect(stopChange).toHaveBeenCalledOnceWith(1, '3');
  });

  it('can show only the editor while leaving the gradient and missing-data display to the view', async () => {
    await TestBed.configureTestingModule({
      declarations: [ContinuousColorRampComponent],
      imports: [FormsModule, SelectModule],
    }).compileComponents();
    const fixture = TestBed.createComponent(ContinuousColorRampComponent);
    const component = fixture.componentInstance;
    const configured = buildComponent();
    component.editable = true;
    component.config = configured.config;
    component.resolved = configured.resolved;
    component.showPreview = false;
    component.showMissingColor = false;
    component.automaticDomainLabel = 'Automatic (heatmap data)';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="continuous-color-gradient"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.continuous-ramp__missing')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.continuous-ramp__stop-row').length).toBe(3);
    expect(fixture.nativeElement.querySelector('p-select')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Custom bounds');
  });
});
