import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { resolveVariableColorScale } from '@app/contactTraceCommonServices/variable-color-scale';
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

  it('assigns continuous node-color values across the configured Epi Curve bins', () => {
    const scale = resolveVariableColorScale(
      [{ score: 0 }, { score: 40 }, { score: null }],
      'score',
      {
        mode: 'continuous',
        domain: { kind: 'auto' },
        missingColor: '#eae553',
      },
    );

    component.widgets['epiCurve-stackColorBy'] = 'Node Color';
    component.widgets['epiCurve-continuousBinCount'] = 4;
    (component as any).continuousNodeScale = scale;
    (component as any).continuousColorBins = (component as any).buildContinuousColorBins(scale);

    const getBin = (score: unknown) => (component as any).getNodeStackValue({ score }, 'score');

    expect([getBin(0), getBin(15), getBin(25), getBin(40)]).toEqual([
      '__mt_continuous_0',
      '__mt_continuous_1',
      '__mt_continuous_2',
      '__mt_continuous_3',
    ]);
    expect(getBin(null)).toBe('__mt_continuous_missing');
  });
});
