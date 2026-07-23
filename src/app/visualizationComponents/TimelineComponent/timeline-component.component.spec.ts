import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';

import { BaseComponentDirective } from '@app/base-component.directive';
import { GoogleTagManagerService } from '../../analytics/google-tag-manager.service';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { CommonStoreService } from '../../contactTraceCommonServices/common-store.services';
import { ExportService } from '../../contactTraceCommonServices/export.service';
import { TimelineComponent } from './timeline-component.component';

describe('TimelineComponentComponent', () => {
  let component: TimelineComponent;
  let fixture: ComponentFixture<TimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineComponent ],
      providers: [
        {
          provide: CommonService,
          useValue: {
            visuals: {},
            session: { style: { widgets: {} }, data: {} },
            capitalize: (value: string) => value,
          },
        },
        { provide: BaseComponentDirective.GoldenLayoutContainerInjectionToken, useValue: { on: () => undefined } },
        { provide: GoogleTagManagerService, useValue: { pushTag: () => undefined } },
        { provide: CommonStoreService, useValue: { clusterUpdate$: EMPTY, setNetworkRendered: () => undefined } },
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
