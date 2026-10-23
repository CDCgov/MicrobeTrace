import { TwoDComponent } from './twoD-plugin.component';
import {
  createFieldOptionValue,
  INTERNAL_FIELD_OPTION_VALUES,
} from '@app/contactTraceCommonServices/internal-field-options';

describe('2D field options across renderer paths', () => {
  function createView(): any {
    const view = Object.create(TwoDComponent.prototype);
    view.widgets = { 'polygons-show': true };
    view.noFieldOptionValue = INTERNAL_FIELD_OPTION_VALUES.none;
    view.legacyNodeFieldOptions = { None: INTERNAL_FIELD_OPTION_VALUES.none };
    view.legacyLinkFieldOptions = { None: INTERNAL_FIELD_OPTION_VALUES.none };
    view.sigmaActive = true;
    view.refreshSigmaForStyleChange = jasmine.createSpy('refreshSigmaForStyleChange').and.returnValue(true);
    return view;
  }

  it('normalizes the no-field grouping choice before refreshing Sigma', async () => {
    const view = createView();
    await view.centerPolygons('None');

    expect(view.widgets['polygons-foci']).toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(view.getActiveNodeGroupingField()).toBeNull();
    expect(view.refreshSigmaForStyleChange).toHaveBeenCalledWith(true);
  });

  it('keeps a real None grouping field available to Sigma', async () => {
    const view = createView();
    const field = createFieldOptionValue('None', ['None']);
    await view.centerPolygons(field, false);

    expect(view.widgets['polygons-foci']).toBe(field);
    expect(view.getActiveNodeGroupingField()).toBe('None');
    expect(view.refreshSigmaForStyleChange).toHaveBeenCalledWith(false);
  });

  it('rebuilds the Sigma layout without invoking the Cytoscape grouping path', async () => {
    const view = createView();
    view.commonService = { session: { network: { allPinned: false } } };
    const renderer = { destroy: jasmine.createSpy('destroy') };
    view.sigmaRenderer = renderer;
    view.sigmaLayoutGroupByNodeId = new Map([['A', 'group-a']]);
    view.renderSigma = jasmine.createSpy('renderSigma').and.returnValue(Promise.resolve());

    await view.updateLayout();

    expect(renderer.destroy).toHaveBeenCalled();
    expect(view.sigmaLayoutGroupByNodeId.size).toBe(0);
    expect(view.renderSigma).toHaveBeenCalledWith(false);
  });

  it('keeps imported node labels but suppresses collapsed-node labels', () => {
    const view = createView();
    view.widgets['node-label-variable'] = createFieldOptionValue('constructor');

    expect(view.getNodeLabel({ constructor: 'Imported label' })).toBe('Imported label');
    expect(view.getNodeLabel({ isCollapsedAggregate: true, label: 'Aggregate', totalCount: 2 })).toBe('');
    view.widgets['node-label-variable'] = INTERNAL_FIELD_OPTION_VALUES.none;
    expect(view.getNodeLabel({ constructor: 'Imported label' })).toBe('');
  });

  it('normalizes fixed link width before refreshing Sigma', () => {
    const view = createView();
    view.updateLinkWidthRows = jasmine.createSpy('updateLinkWidthRows');
    view.updateMinMaxLink = jasmine.createSpy('updateMinMaxLink');
    view.scaleLinkWidth = jasmine.createSpy('scaleLinkWidth');

    view.onLinkWidthVariableChange('None');

    expect(view.widgets['link-width-variable']).toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(view.SelectedLinkWidthByVariable).toBe(INTERNAL_FIELD_OPTION_VALUES.none);
    expect(view.refreshSigmaForStyleChange).toHaveBeenCalled();
    expect(view.scaleLinkWidth).not.toHaveBeenCalled();
  });

  it('scales link widths from a real None field regardless of distance provenance', () => {
    const view = createView();
    view.widgets['link-width-variable'] = createFieldOptionValue('None', ['None']);
    view.widgets['link-width-min'] = 3;
    view.widgets['link-width-max'] = 27;
    view.getVLinks = () => [
      { None: '2', distanceOrigin: 'other.csv', origin: ['links.csv'] },
      { None: '6' },
      { None: 'not-a-number' },
    ];

    view.updateMinMaxLink();

    expect(view.linkMin).toBe(2);
    expect(view.linkMax).toBe(6);
    expect(view.linkScale(2)).toBe(3);
    expect(view.linkScale(6)).toBe(27);
  });

  it('retains the upstream distance-provenance filter for canonical distance widths', () => {
    const view = createView();
    view.widgets['link-width-variable'] = 'distance';
    view.widgets['link-width-min'] = 3;
    view.widgets['link-width-max'] = 27;
    view.getVLinks = () => [
      { distance: 100, distanceOrigin: 'other.csv', origin: ['links.csv'] },
      { distance: 2, distanceOrigin: 'links.csv', origin: ['links.csv'] },
      { distance: 6 },
    ];

    view.updateMinMaxLink();

    expect(view.linkMin).toBe(2);
    expect(view.linkMax).toBe(6);
  });
});
