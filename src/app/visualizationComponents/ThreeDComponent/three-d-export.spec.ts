import { ElementRef } from '@angular/core';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { ThreeDComponent } from './three-d-plugin.component';

describe('3D network image export', () => {
  let component: ThreeDComponent;
  let service: ExportService;
  let snapshot: jasmine.Spy;
  let common: any;

  beforeEach(() => {
    common = {
      visuals: {}, isNetworkSubsetFilterActive: () => false, getNetworkSubsetFilterLabel: () => 'State = Texas',
      session: { style: { widgets: { 'node-symbol': 'triangle' } } },
    };
    service = new ExportService();
    component = new ThreeDComponent({} as any, new ElementRef(document.createElement('div')), common, {} as any,
      { markForCheck: () => {} } as any, {} as any, service);
    component.graphHost = new ElementRef(document.createElement('div'));
    component.shapeExportTable = new ElementRef(document.createElement('div'));
    spyOn(component.graphHost.nativeElement, 'getBoundingClientRect').and.returnValue({ width: 800, height: 600 } as DOMRect);
    snapshot = jasmine.createSpy('snapshot').and.returnValue(document.createElement('canvas'));
    (component as any).renderer = { snapshot };
    component.loading = false;
    spyOn(service, 'waitForUiPaint').and.returnValue(Promise.resolve());
    spyOn(service, 'requestRendererRasterExport');
  });

  it('updates the network resolution and filtered scope independently of 2D', () => {
    component.exportScale = 0.5;
    component.openExport();
    expect(component.exportResolution).toBe('400 x 300');
    expect(component.exportScopeLabel).toBe('Export scope: full visible network');
    common.isNetworkSubsetFilterActive = () => true;
    expect(component.exportScopeLabel).toContain('filtered visible network (State = Texas)');
    expect(common.session.style.widgets).toEqual({ 'node-symbol': 'triangle' });
  });

  it('closes the dialog and paints progress before capture, ignoring duplicate submits', async () => {
    let paint: () => void;
    (service.waitForUiPaint as jasmine.Spy).and.returnValue(new Promise<void>(resolve => paint = resolve));
    component.exportOpen = true;
    component.exportFilename = ' investigation ';
    component.exportFiletype = 'webp'; component.exportScale = 0.5; component.exportQuality = 0.7;
    const pending = component.exportImage();
    expect(component.exportOpen).toBeFalse();
    expect(service.getExportProgress().active).toBeTrue();
    expect(snapshot).not.toHaveBeenCalled();
    await component.exportImage();
    paint(); await pending;
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(service.getExportOptions()).toEqual({ filename: 'investigation', filetype: 'webp', scale: 0.5, quality: 0.7 });
    expect(service.requestRendererRasterExport).toHaveBeenCalledWith(snapshot.calls.mostRecent().returnValue, 800, 600, [], true, true, false);
  });

  it('includes a displayed independent 3D shape key and excludes a hidden one', async () => {
    const table = document.createElement('table'); component.shapeExportTable.nativeElement.append(table);
    component.settings.nodeShapeField = 'group'; component.shapeLegend.mode = 'Dock';
    await component.exportImage();
    expect((service.requestRendererRasterExport as jasmine.Spy).calls.mostRecent().args.slice(3)).toEqual([[table], true, true, false]);
    component.shapeLegend.mode = 'Hide'; await component.exportImage();
    expect((service.requestRendererRasterExport as jasmine.Spy).calls.mostRecent().args.slice(3)).toEqual([[], true, true, false]);
  });

  it('rejects invalid scales and encoding options before beginning a download', async () => {
    for (const scale of [0, 2.1, NaN]) {
      component.exportScale = scale; await component.exportImage();
      expect(component.exportError).toContain('between 0.1 and 2');
    }
    component.exportScale = 1; component.exportQuality = 2; await component.exportImage();
    expect(component.exportError).toContain('quality');
    component.exportQuality = 0.9; component.exportFiletype = 'svg'; await component.exportImage();
    expect(component.exportError).toContain('PNG, JPEG, or WebP');
    expect(snapshot).not.toHaveBeenCalled();
    expect(service.getExportProgress().active).toBeFalse();
  });

  it('reopens the dialog with an error and ends progress if image capture fails', async () => {
    snapshot.and.throwError('Graphics connection interrupted');
    await component.exportImage();
    expect(component.exportError).toBe('Graphics connection interrupted');
    expect(component.exportOpen).toBeTrue();
    expect(component.exporting).toBeFalse();
    expect(service.getExportProgress().active).toBeFalse();
    expect(service.requestRendererRasterExport).not.toHaveBeenCalled();
  });

  it('ends progress without reopening a component closed while waiting for paint', async () => {
    let paint: () => void;
    (service.waitForUiPaint as jasmine.Spy).and.returnValue(new Promise<void>(resolve => paint = resolve));
    const pending = component.exportImage(); (component as any).destroyed = true;
    paint(); await pending;
    expect(component.exportOpen).toBeFalse();
    expect(snapshot).not.toHaveBeenCalled();
    expect(service.getExportProgress().active).toBeFalse();
  });
});
