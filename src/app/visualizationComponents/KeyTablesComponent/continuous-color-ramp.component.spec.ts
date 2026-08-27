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
});
