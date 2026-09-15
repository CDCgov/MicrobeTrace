import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
});
