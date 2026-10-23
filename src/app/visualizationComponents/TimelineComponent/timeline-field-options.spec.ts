import { TimelineComponent } from './timeline-component.component';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { createFieldOptionValue, INTERNAL_FIELD_OPTION_VALUES } from '@app/contactTraceCommonServices/internal-field-options';

describe('Epi Curve stack field selection', () => {
  function createView(value: string): any {
    const view = Object.create(TimelineComponent.prototype);
    const service = Object.create(CommonService.prototype);
    service.session = {
      data: { nodes: [{ visible: true, None: 'A' }, { visible: true, None: 'B' }] },
      style: { widgets: { 'node-color-variable': 'None' } }
    };
    view.commonService = service;
    view.noFieldOptionValue = INTERNAL_FIELD_OPTION_VALUES.none;
    view.timelineNodeColorOptionValue = INTERNAL_FIELD_OPTION_VALUES.timelineNodeColor;
    view.widgets = { 'epiCurve-stackColorBy': value };
    return view;
  }

  it('keeps a real None field available as a stack variable', () => {
    const field = createFieldOptionValue('None', ['None']);
    const view = createView(field);
    expect(view.getCurrentStackColorVariable()).toBe(field);
    expect(view.getCurrentStackKeys(field)).toEqual(['A', 'B']);
  });

  it('keeps the no-field choice from creating a phantom stack group', () => {
    const view = createView(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(view.getCurrentStackColorVariable()).toBe('None');
    expect(view.getCurrentStackKeys(view.getCurrentStackColorVariable())).toEqual([]);
  });
});
