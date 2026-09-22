import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as d3 from 'd3';
import { of } from 'rxjs';

import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { TimelineComponent } from './timeline-component.component';

@Pipe({ name: 'localize', standalone: false })
class LocalizePipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('TimelineComponentComponent', () => {
  let component: TimelineComponent;
  let fixture: ComponentFixture<TimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TimelineComponent, LocalizePipeStub],
      providers: [
        {
          provide: CommonService,
          useValue: {
            capitalize: (value: string) => value,
            session: {
              data: { nodeFields: [] },
              style: { widgets: {} },
            },
            visuals: {},
          },
        },
        {
          provide: BaseComponentDirective.GoldenLayoutContainerInjectionToken,
          useValue: { on: () => undefined },
        },
        {
          provide: CommonStoreService,
          useValue: {
            clusterUpdate$: of(undefined),
            setNetworkRendered: () => undefined,
          },
        },
        { provide: ExportService, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default the legend position to the bottom', () => {
    expect(component.widgets['epiCurve-legendPosition']).toBe('Bottom');
  });

  it('should render stacked bars and lines in separate legend sections', () => {
    component.widgets['epiCurve-legendPosition'] = 'Bottom';
    component.selectedGraphType = 'Multi: Overlay';
    component['height'] = 300;
    component['width'] = 600;

    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const epiCurve = d3.select(svgElement).append('g');
    component['generateLegendSections'](epiCurve, [
      {
        id: 'stacked-bars',
        title: 'Stacked bars — Cases by State (Right axis)',
        items: [
          { color: '#f22020', label: 'Texas', seriesType: 'bar' },
          { color: '#0ec434', label: 'Florida', seriesType: 'bar' },
        ],
      },
      {
        id: 'lines',
        title: 'Lines (Left axis)',
        items: [
          { color: '#b79ecc', label: 'Onset trend', seriesType: 'line', lineStyle: 'Solid' },
        ],
      },
    ]);

    const sections = svgElement.querySelectorAll('.epiCurve-legend-section');
    expect(sections.length).toBe(2);
    expect(sections[0].getAttribute('data-legend-section')).toBe('stacked-bars');
    expect(sections[1].getAttribute('data-legend-section')).toBe('lines');
    expect(sections[0].querySelector('.epiCurve-legend-section-title')?.textContent)
      .toContain('Stacked bars');
    expect(sections[1].querySelector('.epiCurve-legend-section-title')?.textContent)
      .toContain('Lines');
    expect([...sections[0].querySelectorAll('.epiCurve-legend-label')]
      .map(label => label.textContent)).toEqual(['Texas', 'Florida']);
    expect([...sections[1].querySelectorAll('.epiCurve-legend-label')]
      .map(label => label.textContent)).toEqual(['Onset trend']);
  });
});
