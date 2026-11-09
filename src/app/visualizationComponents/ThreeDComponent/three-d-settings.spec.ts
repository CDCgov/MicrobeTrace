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
});
