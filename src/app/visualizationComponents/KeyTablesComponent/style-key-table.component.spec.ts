import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StyleKeyTableComponent, StyleKeyTableRow } from './style-key-table.component';

describe('StyleKeyTableComponent mixed color controls', () => {
  let component: StyleKeyTableComponent;
  let mixedRow: StyleKeyTableRow;

  beforeEach(() => {
    component = new StyleKeyTableComponent();
    mixedRow = {
      rawValue: '2a/3a',
      trackKey: 'node-color-mixed-2a/3a',
      displayName: '2a/3a (75%/25%)',
      count: 1,
      frequency: 0.5,
      colorSegments: [
        { value: '2a', displayName: '2a', color: '#ff0000', opacity: 1, weight: 0.75, index: 1 },
        { value: '3a', displayName: '3a', color: '#0000ff', opacity: 0.8, weight: 0.25, index: 2 }
      ]
    };
  });

  it('opens and closes the per-color controls from the mixed transparency trigger', () => {
    const clickEvent = new MouseEvent('click');

    component.onSegmentAlphaTriggerClick(mixedRow, clickEvent);
    expect(component.isSegmentAlphaEditorOpen(mixedRow)).toBe(true);

    component.onSegmentAlphaTriggerClick(mixedRow, clickEvent);
    expect(component.isSegmentAlphaEditorOpen(mixedRow)).toBe(false);
  });

  it('keeps the mixed transparency controls open for slider clicks and closes them on click-away', async () => {
    await TestBed.configureTestingModule({
      declarations: [StyleKeyTableComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    const fixture: ComponentFixture<StyleKeyTableComponent> = TestBed.createComponent(StyleKeyTableComponent);
    fixture.componentInstance.tableId = 'node-color-table';
    fixture.componentInstance.controlType = 'color';
    fixture.componentInstance.rows = [mixedRow];
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('[data-mixed-alpha-trigger="true"]') as HTMLElement;
    trigger.click();
    fixture.detectChanges();

    let editor = fixture.nativeElement.querySelector('.style-key-table__segment-alpha-editor') as HTMLElement | null;
    expect(editor).not.toBeNull();

    const slider = editor!.querySelector('.style-key-table__segment-alpha-slider') as HTMLElement;
    slider.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.style-key-table__segment-alpha-editor')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    editor = fixture.nativeElement.querySelector('.style-key-table__segment-alpha-editor') as HTMLElement | null;
    expect(editor).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('emits the component value and domain index when its slider changes', () => {
    const emittedChanges: any[] = [];
    component.segmentAlphaChange.subscribe(change => emittedChanges.push(change));
    const input = document.createElement('input');
    input.value = '0.35';

    component.onSegmentAlphaInput(mixedRow, mixedRow.colorSegments![0], 0, { target: input } as unknown as Event);

    expect(mixedRow.colorSegments![0].opacity).toBe(0.35);
    expect(emittedChanges).toEqual([
      jasmine.objectContaining({
        row: mixedRow,
        value: '2a',
        segmentIndex: 0,
        alpha: 0.35,
        segment: jasmine.objectContaining({ index: 1 })
      })
    ]);
  });

  it('emits the component value when one color in a mixed swatch changes', () => {
    const emittedChanges: any[] = [];
    component.colorChange.subscribe(change => emittedChanges.push(change));
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#00aa00';

    component.onSegmentColorInputChange(mixedRow, mixedRow.colorSegments![0], { target: input } as unknown as Event);

    expect(mixedRow.colorSegments![0].color).toBe('#00aa00');
    expect(mixedRow.colorSegments![1].color).toBe('#0000ff');
    expect(emittedChanges).toEqual([{
      row: mixedRow,
      value: '2a',
      color: '#00aa00'
    }]);
  });

  it('keeps non-node segmented swatches non-interactive', () => {
    const duoRow: StyleKeyTableRow = {
      rawValue: 'Duo-Link',
      trackKey: 'link-color-duo',
      displayName: 'Duo-Link',
      count: 2,
      frequency: 1,
      duoSegments: [
        { color: '#ff0000', opacity: 1 },
        { color: '#0000ff', opacity: 1 }
      ]
    };

    component.onSegmentAlphaTriggerClick(duoRow, new MouseEvent('click'));

    expect(component.isSegmentAlphaEditorOpen(duoRow)).toBe(false);
  });

  it('renders mixed legend colors as one rectangular striped swatch', async () => {
    await TestBed.configureTestingModule({
      declarations: [StyleKeyTableComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    const fixture: ComponentFixture<StyleKeyTableComponent> = TestBed.createComponent(StyleKeyTableComponent);
    fixture.componentInstance.controlType = 'color';
    fixture.componentInstance.editable = false;
    fixture.componentInstance.rows = [mixedRow];
    fixture.detectChanges();

    const swatchSet = fixture.nativeElement.querySelector('[data-mixed-color-swatch="true"]') as HTMLElement;
    const swatchBar = swatchSet.querySelector('.style-key-table__duo-inner') as HTMLElement;
    const stripes = Array.from(
      swatchSet.querySelectorAll('[data-color-segment]')
    ) as HTMLElement[];

    expect(stripes.length).toBe(2);
    expect(stripes.map(stripe => getComputedStyle(stripe).backgroundColor)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)'
    ]);
    expect(getComputedStyle(swatchSet).width).toBe('50px');
    expect(getComputedStyle(swatchBar).width).toBe('42px');
    expect(getComputedStyle(swatchBar).borderStyle).toBe('solid');
    expect(getComputedStyle(swatchBar).borderRadius).toBe('0px');
    expect(stripes.every(stripe => getComputedStyle(stripe).borderRadius === '0px')).toBe(true);
    expect(stripes.map(stripe => stripe.getAttribute('data-segment-weight'))).toEqual(['0.75', '0.25']);
    expect(stripes.map(stripe => stripe.getAttribute('aria-label'))).toEqual(['2a', '3a']);
    expect(component.getSegmentFlexGrow(mixedRow.colorSegments![0])).toBe(0.75);
    expect(component.getSegmentFlexGrow(mixedRow.colorSegments![1])).toBe(0.25);
  });
});
