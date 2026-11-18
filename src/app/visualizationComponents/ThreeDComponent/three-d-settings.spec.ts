import { ElementRef } from '@angular/core';
import { ThreeDComponent } from './three-d-plugin.component';
import { readThreeDSettings } from './three-d-network.model';

describe('3D shape legend and settings isolation', () => {
  let component: ThreeDComponent;
  let common: any;
  let visible: any[];
  beforeEach(() => {
    const nodes = [{ _id: 'A', group: 'one' }, { _id: 'B', group: 'two' }, { _id: 'C', group: 'one' }];
    visible = [...nodes];
    common = {
      visuals: { microbeTrace: { refreshDockedKeyTablesView: jasmine.createSpy(), ensureDockedKeyTablesViewVisible: jasmine.createSpy() } },
      session: { data: { nodes, links: [], linkFields: [], nodeFields: ['_id', 'group'] }, style: { widgets: {
        'node-symbol-variable': 'type', 'node-symbol': 'triangle', 'link-opacity': 0.8,
      } } },
      getStyleableNodeFields: () => ['_id', 'group'], getVisibleNodes: () => visible, capitalize: value => value,
    };
    component = new ThreeDComponent({} as any, new ElementRef(document.createElement('div')), common, {} as any,
      { markForCheck: () => {} } as any, {} as any, {} as any);
    spyOn(component, 'requestUpdate');
  });

  it('counts only visible nodes without losing hidden categories or changing 2D assignments', () => {
    component.changeShapeLegend({ type: 'field', value: 'group' });
    const assignments = { ...component.settings.nodeShapeMappings.group };
    expect(component.shapeLegend.rows.reduce((sum, row) => sum + Number(row.count), 0)).toBe(3);
    visible = [common.session.data.nodes[1]];
    component.openSettings();
    expect(component.shapeLegend.rows.length).toBe(1);
    expect(component.shapeLegend.rows[0].count).toBe(1);
    expect(component.shapeLegend.rows[0].frequency).toBe(1);
    expect(component.settings.nodeShapeMappings.group).toEqual(assignments);
    expect(common.session.style.widgets['node-symbol-variable']).toBe('type');
    expect(common.session.style.widgets['node-symbol']).toBe('triangle');
  });

  it('round-trips independent display names, table preferences, and category assignments', () => {
    component.changeShapeLegend({ type: 'field', value: 'group' });
    component.changeShapeLegend({ type: 'shape', value: 'cube', category: 'one' });
    component.changeShapeLegend({ type: 'rowName', value: 'First group', category: 'one' });
    component.changeShapeLegend({ type: 'columnName', value: 'Category', column: 'value' });
    component.changeShapeLegend({ type: 'frequencies' });
    component.changeShapeLegend({ type: 'mode', value: 'Hide' });
    common.session.style.widgets = JSON.parse(JSON.stringify(common.session.style.widgets));
    component.settings = readThreeDSettings(common.session.style.widgets);
    component.openSettings();
    expect(component.shapeLegend.mode).toBe('Hide');
    expect(component.shapeLegend.showFrequencies).toBe(true);
    expect(component.shapeLegend.headers.value).toBe('Category');
    expect(component.shapeLegend.rows.find(row => row.rawValue === 'one').displayName).toBe('First group');
    expect(component.shapeLegend.rows.find(row => row.rawValue === 'one').shapeKey).toBe('cube');
  });

  it('saves rendering choices independently and selects previews for the saved shape version', () => {
    Object.assign(component.settings, { shapeVersion: 1, nodeDetail: 'auto', lightingMode: 'camera' });
    component.changeSettings();
    const restored = readThreeDSettings(JSON.parse(JSON.stringify(common.session.style.widgets)));
    expect(restored.shapeVersion).toBe(1); expect(restored.nodeDetail).toBe('auto'); expect(restored.lightingMode).toBe('camera');
    component.openSettings();
    expect(component.shapeLegend.shapeVersion).toBe(1);
    expect(component.shapeLegend.uniformShape.data.previewSrc).toMatch(/^data:image\/png;base64,/);
    expect(common.session.style.widgets['node-symbol-variable']).toBe('type');
    expect(common.session.style.widgets['link-opacity']).toBe(0.8);
  });

  it('increases transparency from left to right without changing 2D alpha or saved 3D appearance', () => {
    component.settings = readThreeDSettings({ '3DNet-link-transparency': 0.75 });
    expect(component.linkTransparency).toBe(0.75);
    expect((component as any).getLinkColor({})).toBe('rgba(153, 153, 153, 0.25)');
    component.linkTransparency = 0.25;
    component.changeSettings();
    expect(component.settings.linkTransparency).toBe(0.25);
    expect(common.session.style.widgets['3DNet-link-transparency']).toBe(0.25);
    expect(component.settings.linkOpacityOverride).toBe(true);
    expect(common.session.style.widgets['link-opacity']).toBe(0.8);
    component.useLegendTransparency();
    expect(readThreeDSettings(common.session.style.widgets).linkOpacityOverride).toBe(false);
  });

  it('resolves dual-origin colors and alpha from each origin instead of the Duo-Link category', () => {
    common.session.style.widgets['link-color-variable'] = 'origin';
    common.normalizeStyleCategoryValue = value => value;
    common.temp = { style: {
      linkColorMap: value => ({ first: '#ff0000', second: '#0000ff' })[value],
      linkAlphaMap: value => ({ first: 0.3, second: 0.7 })[value],
    } };
    const original = { origin: ['first', 'second'] };
    const colors = (component as any).getLinkColors(original);
    expect(colors).toEqual({ color: 'rgba(255, 0, 0, 0.3)', overlayColor: 'rgba(0, 0, 255, 0.7)' });
    expect(original.origin).toEqual(['first', 'second']);
    component.linkTransparency = 0.75;
    expect((component as any).getLinkColors(original)).toEqual({ color: 'rgba(255, 0, 0, 0.25)', overlayColor: 'rgba(0, 0, 255, 0.25)' });
    expect(common.session.style.widgets['link-opacity']).toBe(0.8);
  });

  it('uses solid links for other color fields and resolves the canonical Origin alias', () => {
    common.normalizeStyleCategoryValue = value => value;
    common.temp = { style: { linkColorMap: () => '#123456', linkAlphaMap: () => 1 } };
    common.session.style.widgets['link-color-variable'] = 'kind';
    expect((component as any).getLinkColors({ kind: 'distance', origin: ['first', 'second'] })).toEqual({ color: 'rgb(18, 52, 86)' });
    common.session.style.widgets['link-color-variable'] = 'Origin';
    expect((component as any).getLinkColors({ origin: ['first', 'second'] }).overlayColor).toBe('rgb(18, 52, 86)');
    expect((component as any).getLinkColors({ origin: ['first'] }).overlayColor).toBeUndefined();
  });

  it('opens the shape legend docked when other tables are docked and preserves an explicit floating choice', () => {
    common.session.style.widgets['node-symbol-table-visible'] = 'Dock';
    component.openShapes(new MouseEvent('click'));
    expect(component.shapeLegend.mode).toBe('Dock');
    expect(common.visuals.microbeTrace.ensureDockedKeyTablesViewVisible).toHaveBeenCalled();
    component.changeShapeLegend({ type: 'mode', value: 'Show' });
    component.openShapes(new MouseEvent('click'));
    expect(component.shapeLegend.mode).toBe('Show');
    expect(common.session.style.widgets['node-symbol-table-visible']).toBe('Dock');
  });

  it('defaults new or reopened hidden shape legends to the other tables display mode', () => {
    common.session.style.widgets['node-symbol-table-visible'] = 'Show';
    component.openSettings();
    expect(component.shapeLegend.mode).toBe('Show');
    component.changeShapeLegend({ type: 'mode', value: 'Hide' });
    common.session.style.widgets['node-symbol-table-visible'] = 'Dock';
    component.openShapes(new MouseEvent('click'));
    expect(component.shapeLegend.mode).toBe('Dock');
  });

  describe('large-network performance advisory', () => {
    const review = () => (component as any).updatePerformanceAdvisory() as boolean;

    it('uses both visible node and link counts, with inclusive recommended boundaries', () => {
      for (const [nodes, links, tier] of [[750, 1500, 0], [751, 0, 1], [20, 1501, 1], [2000, 4000, 1], [2001, 1, 2], [20, 4001, 2]]) {
        component.nodeCount = nodes;
        component.linkCount = links;
        expect(review()).withContext(`${nodes} nodes / ${links} links`).toBe(tier > 0);
        expect(component.performanceAdvisoryTier).toBe(tier);
      }
    });

    it('does not repeat an acknowledged advisory until the graph reaches the higher tier', () => {
      component.nodeCount = 1000;
      expect(review()).toBeTrue();
      component.continueInThreeD();
      expect(component.performanceAdvisoryOpen).toBeFalse();
      expect(component.requestUpdate).toHaveBeenCalled();
      component.nodeCount = 1800;
      expect(review()).toBeFalse();
      component.linkCount = 4001;
      expect(review()).toBeTrue();
      component.continueInThreeD();
      expect(review()).toBeFalse();
    });

    it('closes the advisory when filtering brings the graph below the recommendation', () => {
      component.nodeCount = 1000;
      expect(review()).toBeTrue();
      component.nodeCount = 20;
      component.linkCount = 30;
      expect(review()).toBeFalse();
      expect(component.performanceAdvisoryOpen).toBeFalse();
      component.nodeCount = 1000;
      expect(review()).toBeTrue();
    });

    it('reviews each newly loaded dataset without writing acknowledgements to shared style settings', () => {
      component.nodeCount = 1000;
      const widgets = JSON.stringify(common.session.style.widgets);
      review();
      component.continueInThreeD();
      common.session.data.nodes = [...common.session.data.nodes];
      expect(review()).toBeTrue();
      expect(JSON.stringify(common.session.style.widgets)).toBe(widgets);
    });

    it('defers rendering unreviewed large graphs while hidden without opening a dialog', () => {
      component.viewActive = false;
      component.nodeCount = 1000;
      expect(review()).toBeTrue();
      expect(component.performanceAdvisoryOpen).toBeFalse();
      component.viewActive = true;
      expect(review()).toBeTrue();
      expect(component.performanceAdvisoryOpen).toBeTrue();
    });

    it('preserves saved camera and layout state while rendering is deferred', () => {
      const getState = jasmine.createSpy('getState');
      common.session.meta = {};
      Object.assign(component as any, {
        renderer: { getState }, needsRestore: false, renderingDeferred: true,
        sourceNodes: common.session.data.nodes, persistedState: null,
      });
      component.persistViewState();
      expect(getState).not.toHaveBeenCalled();
      expect(common.session.meta.threeDViewState).toBeUndefined();
    });
  });

  it('does not persist the intermediate camera or positions while preparing the first layout', () => {
    const getState = jasmine.createSpy('getState');
    common.session.meta = {};
    Object.assign(component as any, {
      renderer: { getState }, needsRestore: false, renderingDeferred: false,
      sourceNodes: common.session.data.nodes, persistedState: null, preparingInitialLayout: true,
    });
    component.persistViewState();
    expect(getState).not.toHaveBeenCalled();
    expect(common.session.meta.threeDViewState).toBeUndefined();
  });
});
