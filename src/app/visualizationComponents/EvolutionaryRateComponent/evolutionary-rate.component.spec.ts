import { ElementRef } from '@angular/core';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { of } from 'rxjs';
import { EvolutionaryRateComponent } from './evolutionary-rate.component';

describe('EvolutionaryRateComponent', () => {
  function createComponent(options: {
    nodeFields?: string[];
    nodes?: any[];
    widgets?: Record<string, any>;
    pairDistances?: Record<string, number>;
    phylogenetic?: boolean;
    patristicDistances?: Record<string, number>;
    bestFitPatristicDistances?: Record<string, number>;
  } = {}) {
    const widgets = {
      'default-distance-metric': 'snps',
      'tn93-distance-display-format': 'decimal',
      'background-color': '#ffffff',
      'background-color-contrast': '#000000',
      'selected-color': '#ff8300',
      'selected-node-stroke-color': '#ff8300',
      'selected-node-stroke-width': '4px',
      'node-color': '#1f77b4',
      'node-symbol': 'ellipse',
      'node-symbol-variable': 'None',
      'evolutionary-rate-date-field': 'None',
      'evolutionary-rate-root-method': 'as-provided',
      'evolutionary-rate-table-visible': 'Show',
      'evolutionary-rate-node-label-variable': 'None',
      'evolutionary-rate-node-label-size': 16,
      'evolutionary-rate-node-label-orientation': 'Right',
      'evolutionary-rate-node-tooltip-variable': ['_id'],
      'evolutionary-rate-node-radius-variable': 'None',
      'evolutionary-rate-node-radius': 20,
      'evolutionary-rate-node-radius-min': 15,
      'evolutionary-rate-node-radius-max': 85,
      'evolutionary-rate-node-border-width': 2,
      ...options.widgets,
    };
    const nodes = options.nodes || [];
    const commonService = {
      session: {
        data: {
          nodeFields: options.nodeFields || ['_id', 'collectionDate'],
          nodes,
          nodeFilteredValues: nodes.map(node => ({ ...node })),
        },
        style: {
          widgets,
          nodeSymbolsTableKeys: {},
          nodeSymbolsTable: {},
        },
      },
      temp: {
        style: {
          nodeSymbolMap: () => 'ellipse',
        },
      },
      titleize: (value: string) => value,
      getVisibleNodes: () => nodes,
      hasValidTimelineDateValue: (value: any) => value !== null && value !== undefined && value !== '',
      hasPhylogeneticDistanceSource: () => Boolean(options.phylogenetic),
      getPatristicRootDistanceMap: jasmine.createSpy('getPatristicRootDistanceMap').and.callFake(
        async () => new Map(Object.entries(options.patristicDistances || {}))
      ),
      getPatristicBestFitRootDistanceMap: jasmine.createSpy('getPatristicBestFitRootDistanceMap').and.callFake(
        async () => new Map(Object.entries(options.bestFitPatristicDistances || {}))
      ),
      getActiveNodePairDistance: (source: string, target: string) => {
        if (source === target) return 0;
        const key = [source, target].sort().join('|');
        return options.pairDistances?.[key] ?? null;
      },
      tn93PercentageDisplayEnabled: () => widgets['default-distance-metric'] === 'tn93'
        && widgets['tn93-distance-display-format'] === 'percentage',
      getNodeFillStyle: () => ({ color: '#1f77b4', alpha: 1 }),
    } as any;
    const container = {
      width: 800,
      height: 500,
      on: () => undefined,
    } as any;
    const store = {
      clusterUpdate$: of(),
      networkUpdated$: of(),
      metricChanged$: of(),
      styleFileApplied$: of(),
      setNetworkRendered: jasmine.createSpy('setNetworkRendered'),
    } as any;
    const changeDetector = { detectChanges: jasmine.createSpy('detectChanges') } as any;
    const visuals: any = {};
    const exportService = {
      setExportOptions: jasmine.createSpy('setExportOptions'),
      requestExport: jasmine.createSpy('requestExport'),
      requestSVGExport: jasmine.createSpy('requestSVGExport'),
      exportTableAsSVG: jasmine.createSpy('exportTableAsSVG'),
    } as any;
    const host = document.createElement('div');
    const exportHost = document.createElement('div');
    exportHost.appendChild(host);
    const component = new EvolutionaryRateComponent(
      container,
      new ElementRef(document.createElement('div')),
      commonService,
      store,
      changeDetector,
      visuals,
      exportService,
    );

    component.plotExportHost = new ElementRef(exportHost);
    component.plotHost = new ElementRef(host);
    (component as any).widgets = widgets;
    (component as any).viewInitialized = true;

    return { component, commonService, widgets, visuals, exportService, exportHost, host };
  }

  it('loads independent default appearance settings and exposes itself to global visuals', () => {
    const { component, visuals } = createComponent();

    component.loadSettings();

    expect(component.selectedTableVisibility).toBe('Show');
    expect(component.selectedTreeRootMethod).toBe('as-provided');
    expect(component.selectedNodeLabelVariable).toBe('None');
    expect(component.selectedNodeRadius).toBe(20);
    expect(component.selectedNodeBorderWidth).toBe(2);
    expect(component.outlierReportFileType).toBe('pdf');
    expect(visuals.evolutionaryRate).toBe(component);
  });

  it('renders configured node-shape images as vectors in report key tables', () => {
    const table = document.createElement('table');
    table.innerHTML = `
      <tr><th>Node type</th><th>Shape</th></tr>
      <tr>
        <td>Vector</td>
        <td><p-treeselect><div class="shape-tree-value" data-shape-key="fly">Fly</div></p-treeselect></td>
      </tr>
    `;

    const output = new ExportService().exportTableAsSVG(table, true, true, 20);

    expect(output.svg).toContain('data-node-shape-key="fly"');
    expect(output.svg).toContain('font-size="20"');
    expect(output.svg).toContain('<path');
    expect(output.svg).toContain('>Fly</text>');
    expect(output.svg).not.toContain('<image');
    expect(output.svg).not.toContain('width="12" height="12" rx="4"');
  });

  it('persists table and node appearance settings under the evolutionary-rate prefix', () => {
    const { component, widgets } = createComponent();
    component.loadSettings();

    component.onTableVisibilityChange('Hide');
    component.onTreeRootMethodChange('best-fit');
    component.onNodeLabelVariableChange('_id');
    component.onNodeRadiusVariableChange('SNPs');
    component.onNodeBorderWidthChange(3.5);

    expect(component.tableVisible).toBeFalse();
    expect(widgets['evolutionary-rate-table-visible']).toBe('Hide');
    expect(widgets['evolutionary-rate-root-method']).toBe('best-fit');
    expect(widgets['evolutionary-rate-node-label-variable']).toBe('_id');
    expect(widgets['evolutionary-rate-node-radius-variable']).toBe('SNPs');
    expect(widgets['evolutionary-rate-node-border-width']).toBe(3.5);
    expect(widgets['node-label-variable']).toBeUndefined();
  });

  it('plots canonical active-metric link distances and reports invalid visible rows as excluded', async () => {
    const { component, host } = createComponent({
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01', SNPs: 100 },
        { _id: 'b', collectionDate: '2021-01-01', SNPs: 100 },
        { _id: 'c', collectionDate: '2020-02-30', SNPs: 100 },
        { _id: 'd', collectionDate: '2022-01-01', SNPs: 100 },
      ],
      pairDistances: { 'a|b': 2 },
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.includedCount).toBe(2);
    expect(component.excludedCount).toBe(2);
    expect(component.excludedDataPoints.map(point => point.id)).toEqual(['c', 'd']);
    expect(component.excludedDataPoints[0].reason).toBe('Missing or invalid collectionDate value.');
    expect(component.excludedDataPoints[1].reason).toContain('No stored SNPs distance from a');
    component.openExcludedDataPoints();
    expect(component.showExcludedDataPointsDialog).toBeTrue();
    expect(component.analysis.slope).toBeCloseTo(2, 10);
    expect(component.distanceSourceLabel).toContain('SNPs distance from earliest dated sample (a)');
    const renderedPoints = Array.from(host.querySelectorAll('[data-testid="evolutionary-rate-point"]'));
    const regressionLine = host.querySelector('[data-testid="evolutionary-rate-regression-line"]') as SVGLineElement;
    expect(renderedPoints.length).toBe(2);
    expect(regressionLine).not.toBeNull();
    const plotChildren = Array.from(regressionLine.parentElement!.children);
    expect(plotChildren.indexOf(regressionLine)).toBeGreaterThan(
      Math.max(...renderedPoints.map(point => plotChildren.indexOf(point)))
    );
    expect(regressionLine.style.pointerEvents).toBe('none');
    const plotWidth = Number(host.querySelector('clipPath rect')?.getAttribute('width'));
    expect(Number(regressionLine.getAttribute('x1'))).toBeCloseTo(0, 10);
    expect(Number(regressionLine.getAttribute('x2'))).toBeCloseTo(plotWidth, 10);
  });

  it('highlights potential outliers and explains the residual threshold on hover and in report SVGs', async () => {
    const distances = [0, 1, 2, 3, 4, 50, 6, 7, 8, 9];
    const nodes = distances.map((distance, index) => ({
      _id: `sample-${index}`,
      collectionDate: `${2020 + index}-01-01`,
      distance,
    }));
    const pairDistances = Object.fromEntries(
      distances.slice(1).map((distance, index) => [`sample-0|sample-${index + 1}`, distance])
    );
    const { component, host } = createComponent({
      nodes,
      pairDistances,
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    const tooltip = document.createElement('div');
    component.plotTooltip = new ElementRef(tooltip);
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.analysis.outliers.map(item => item.point.id)).toEqual(['sample-5']);
    expect(host.querySelectorAll('[data-testid="evolutionary-rate-outlier-highlight"]')).toHaveSize(1);
    expect(host.querySelector('[data-testid="evolutionary-rate-outlier-highlight"]')?.getAttribute('data-node-id'))
      .toBe('sample-5');
    expect(host.querySelector('[data-testid="evolutionary-rate-outlier-legend"]')?.textContent)
      .toContain('Potential outlier (≥ 2 × RMSE)');

    const outlierPoint = host.querySelector('[data-node-id="sample-5"][data-outlier="true"]') as SVGImageElement;
    expect(outlierPoint).not.toBeNull();
    expect(outlierPoint.getAttribute('aria-label')).toContain('potential outlier');
    outlierPoint.dispatchEvent(new MouseEvent('mouseenter', {
      bubbles: true,
      clientX: 300,
      clientY: 250,
    }));
    expect(tooltip.hidden).toBeFalse();
    expect(tooltip.querySelector('[data-testid="evolutionary-rate-tooltip-outlier"]')?.textContent)
      .toContain('absolute residual');
    expect(tooltip.textContent).toContain('meeting the ≥ 2 × RMSE threshold');
    expect(tooltip.textContent).toContain('Observed:');
    expect(tooltip.textContent).toContain('fitted:');

    const reportSvg = (component as any).serializeRegressionPlotSvg() as string;
    expect(reportSvg).toContain('data-testid="evolutionary-rate-outlier-highlight"');
    expect(reportSvg).toContain('data-testid="evolutionary-rate-outlier-legend"');
    expect(reportSvg).toContain('evolutionary-rate-outlier-point');
    expect(reportSvg).toContain('data-outlier="true"');
    expect(reportSvg).not.toContain('<image');
    const reportDocument = new DOMParser().parseFromString(reportSvg, 'image/svg+xml');
    const tickLabels = Array.from(reportDocument.querySelectorAll('.tick text'));
    const axisTitles = Array.from(reportDocument.querySelectorAll('.axis-title'));
    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels.every(label => label.getAttribute('font-size') === '20')).toBeTrue();
    expect(axisTitles).toHaveSize(2);
    expect(axisTitles.every(title => title.getAttribute('font-size') === '24')).toBeTrue();
    expect(reportDocument.querySelector('[data-testid="evolutionary-rate-outlier-legend"] text')
      ?.getAttribute('font-size')).toBe('20');
  });

  it('recalculates statistics from selected nodes while retaining and highlighting all plotted points', async () => {
    const nodes = [
      { _id: 'a', collectionDate: '2020-01-01', selected: false },
      { _id: 'b', collectionDate: '2021-01-01', selected: true },
      { _id: 'c', collectionDate: '2022-01-01', selected: true },
    ];
    const { component, exportService, host } = createComponent({
      nodes,
      pairDistances: {
        'a|b': 2,
        'a|c': 6,
      },
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.selectionActive).toBeTrue();
    expect(component.selectedNodeCount).toBe(2);
    expect(component.analysis.points.map(point => point.id)).toEqual(['b', 'c']);
    expect(component.analysis.slope).toBeCloseTo(4, 10);
    expect(component.includedCount).toBe(2);
    expect(component.excludedCount).toBe(0);

    const renderedPoints = Array.from(
      host.querySelectorAll('[data-testid="evolutionary-rate-point"]')
    );
    expect(renderedPoints.length).toBe(3);
    expect(
      renderedPoints
        .filter(point => point.getAttribute('data-selected') === 'true')
        .map(point => point.getAttribute('data-node-id'))
    ).toEqual(['b', 'c']);
    const selectedMarkerUri = renderedPoints[1].getAttribute('href') || '';
    expect(decodeURIComponent(selectedMarkerUri)).toContain('stroke="#ff8300"');
    expect(decodeURIComponent(selectedMarkerUri)).toContain('stroke-width="100"');
    const selectionLegend = host.querySelector(
      '[data-testid="evolutionary-rate-selection-legend"]'
    );
    expect(selectionLegend?.textContent).toContain('Regression based on 2 highlighted nodes');
    expect(selectionLegend?.getAttribute('aria-label')).toBe('Regression based on 2 highlighted nodes');
    expect(selectionLegend?.querySelector('circle')?.getAttribute('stroke')).toBe('#ff8300');

    const reportSvg = (component as any).serializeRegressionPlotSvg() as string;
    expect(reportSvg).toContain('data-testid="evolutionary-rate-selection-legend"');
    expect(reportSvg).toContain('Regression based on 2 highlighted nodes');
    const reportDocument = new DOMParser().parseFromString(reportSvg, 'image/svg+xml');
    expect(reportDocument.querySelector('[data-testid="evolutionary-rate-selection-legend"] text')
      ?.getAttribute('font-size')).toBe('20');

    component.plotExportFileType = 'svg';
    component.downloadRegressionPlot();
    const standalonePlotSvg = exportService.requestSVGExport.calls.mostRecent().args[1] as string;
    expect(standalonePlotSvg).toContain('data-testid="evolutionary-rate-selection-legend"');
    expect(standalonePlotSvg).toContain('Regression based on 2 highlighted nodes');

    nodes.forEach(node => node.selected = false);
    await (component as any).refreshPlot();

    expect(component.selectionActive).toBeFalse();
    expect(component.analysis.points.map(point => point.id)).toEqual(['a', 'b', 'c']);
    expect(component.analysis.slope).toBeCloseTo(3, 10);
    expect(
      Array.from(host.querySelectorAll('[data-selected="true"]')).length
    ).toBe(0);
    expect(host.querySelector('[data-testid="evolutionary-rate-selection-legend"]')).toBeNull();
    expect((component as any).serializeRegressionPlotSvg()).not.toContain(
      'data-testid="evolutionary-rate-selection-legend"'
    );
  });

  it('labels a complete selected cluster in the view, plot, and outlier report scope', async () => {
    const nodes = [
      { _id: 'a', collectionDate: '2020-01-01', cluster: 7, selected: true },
      { _id: 'b', collectionDate: '2021-01-01', cluster: 7, selected: true },
      { _id: 'c', collectionDate: '2022-01-01', cluster: 7, selected: true },
    ];
    const { component, host } = createComponent({
      nodeFields: ['_id', 'collectionDate', 'cluster'],
      nodes,
      pairDistances: {
        'a|b': 2,
        'a|c': 4,
      },
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.selectedClusterLabel).toBe('Cluster 7');
    expect(host.querySelector('[data-testid="evolutionary-rate-selection-legend"]')?.textContent)
      .toContain('Cluster 7: Regression based on 3 highlighted nodes');
    const report = (component as any).buildOutlierReport();
    expect(report.contextRows.find((row: any) => row.label === 'Analysis scope')?.value)
      .toBe('Cluster 7; 3 selected visible nodes');
    const reportDocument = new DOMParser().parseFromString(report.regressionPlotSvg, 'image/svg+xml');
    const reportSelectionLabel = reportDocument.querySelector(
      '[data-testid="evolutionary-rate-selection-legend"] text'
    );
    expect(reportSelectionLabel?.textContent).toContain('Cluster 7');
    expect(reportSelectionLabel?.getAttribute('font-size')).toBe('20');

    nodes[2].selected = false;
    await (component as any).refreshPlot();

    expect(component.selectedClusterLabel).toBe('');
    expect(host.querySelector('[data-testid="evolutionary-rate-selection-legend"]')?.textContent)
      .toBe('Regression based on 2 highlighted nodes');
  });

  it('selects plotted nodes with 2D-style single and additive interactions', async () => {
    const nodes = [
      { _id: 'a', collectionDate: '2020-01-01', selected: false },
      { _id: 'b', collectionDate: '2021-01-01', selected: false },
      { _id: 'c', collectionDate: '2022-01-01', selected: false },
    ];
    const { component, commonService, host } = createComponent({
      nodes,
      pairDistances: {
        'a|b': 2,
        'a|c': 6,
      },
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();
    await (component as any).refreshPlot();

    const selectedEvents: string[] = [];
    $(document).on('node-selected.evolutionary-rate-test', () => selectedEvents.push('selected'));
    try {
      const markers = Array.from(
        host.querySelectorAll('[data-testid="evolutionary-rate-point"]')
      ) as SVGImageElement[];
      markers[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(nodes.map(node => node.selected)).toEqual([false, true, false]);
      expect(commonService.session.data.nodeFilteredValues.map(node => node.selected))
        .toEqual([false, true, false]);

      markers[2].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      expect(nodes.map(node => node.selected)).toEqual([false, true, true]);
      expect(selectedEvents.length).toBe(2);
    } finally {
      $(document).off('node-selected.evolutionary-rate-test');
    }
  });

  it('does not fall back to unrelated numeric node fields when pairwise distances are unavailable', async () => {
    const { component } = createComponent({
      nodeFields: ['_id', 'collectionDate', 'SNPs'],
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01', SNPs: 1 },
        { _id: 'b', collectionDate: '2021-01-01', SNPs: 2 },
      ],
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.analysis.points.map(point => point.id)).toEqual(['a']);
    expect(component.regressionMessage).toContain('stored SNPs distance from a');
  });

  it('uses phylogenetic root-to-tip patristic distances instead of the global metric links', async () => {
    const { component, host } = createComponent({
      phylogenetic: true,
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01' },
        { _id: 'b', collectionDate: '2021-01-01' },
        { _id: 'c', collectionDate: '2022-01-01' },
      ],
      pairDistances: { 'a|b': 99, 'a|c': 99 },
      patristicDistances: { a: 0.1, b: 0.2, c: 0.3 },
      widgets: {
        'default-distance-metric': 'tn93',
        'tn93-distance-display-format': 'percentage',
        'evolutionary-rate-date-field': 'collectionDate',
      },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.distanceSourceKind).toBe('patristic');
    expect(component.distanceSourceLabel).toBe('Patristic root-to-tip distance');
    expect(component.analysis.points.map(point => point.distance)).toEqual([0.1, 0.2, 0.3]);
    expect(host.querySelector('[data-testid="evolutionary-rate-y-axis-title"]')?.textContent).toBe('Patristic Distance');
    expect(component.formatSlope()).toBe('0.1');
  });

  it('uses the dated regression tips to locate a best-fit root only when requested', async () => {
    const { component, commonService } = createComponent({
      phylogenetic: true,
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01' },
        { _id: 'b', collectionDate: '2021-01-01' },
        { _id: 'c', collectionDate: '2022-01-01' },
      ],
      patristicDistances: { a: 1, b: 2, c: 4 },
      bestFitPatristicDistances: { a: 0.5, b: 2.5, c: 4.5 },
      widgets: {
        'evolutionary-rate-date-field': 'collectionDate',
        'evolutionary-rate-root-method': 'best-fit',
      },
    });
    component.loadSettings();

    await (component as any).refreshPlot();

    expect(component.distanceSourceLabel).toBe('Best-fit patristic root-to-tip distance');
    expect(component.analysis.points.map(point => point.distance)).toEqual([0.5, 2.5, 4.5]);
    expect(commonService.getPatristicRootDistanceMap).not.toHaveBeenCalled();
    expect(commonService.getPatristicBestFitRootDistanceMap).toHaveBeenCalledTimes(1);
    const datedTips = commonService.getPatristicBestFitRootDistanceMap.calls.mostRecent().args[0];
    expect(datedTips.map((tip: any) => tip.id)).toEqual(['a', 'b', 'c']);
    expect(datedTips.map((tip: any) => tip.decimalYear)).toEqual([2020, 2021, 2022]);
  });

  it('changes the Y-axis label and canonical distances with the selected metric', async () => {
    const pairDistances = { 'a|b': 2 };
    const { component, widgets, host } = createComponent({
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01' },
        { _id: 'b', collectionDate: '2021-01-01' },
      ],
      pairDistances,
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();

    await (component as any).refreshPlot();
    expect(host.querySelector('[data-testid="evolutionary-rate-y-axis-title"]')?.textContent).toBe('Genetic Distance (SNPs)');
    expect(component.analysis.points.map(point => point.distance)).toEqual([0, 2]);

    widgets['default-distance-metric'] = 'tn93';
    pairDistances['a|b'] = 0.02;
    await (component as any).refreshPlot();

    expect(host.querySelector('[data-testid="evolutionary-rate-y-axis-title"]')?.textContent).toBe('Genetic Distance (TN93)');
    expect(component.analysis.points.map(point => point.distance)).toEqual([0, 0.02]);
  });

  it('exports the statistics CSV and routes configurable raster and SVG plots through the shared export service', async () => {
    const { component, exportService, exportHost, host, visuals } = createComponent({
      nodes: [
        { _id: 'a', collectionDate: '2020-01-01' },
        { _id: 'b', collectionDate: '2021-01-01' },
      ],
      pairDistances: { 'a|b': 2 },
      widgets: { 'evolutionary-rate-date-field': 'collectionDate' },
    });
    component.loadSettings();
    await (component as any).refreshPlot();

    const nodeColorTable = document.createElement('table');
    const nodeShapeTable = document.createElement('table');
    nodeShapeTable.innerHTML = '<tr><td><p-treeselect><span data-shape-key="fly">Fly</span></p-treeselect></td></tr>';
    visuals.microbeTrace = {
      getNodeKeyTablesForExport: () => [nodeColorTable, nodeShapeTable],
    };
    exportService.exportTableAsSVG.and.callFake((table: HTMLTableElement) => table === nodeColorTable
      ? {
        svg: '<g><text data-testid="report-node-color-key">Node color key</text></g>',
        width: 220,
        height: 70,
      }
      : {
        svg: '<g><text data-testid="report-node-shape-key">Node shape key</text></g>',
        width: 220,
        height: 70,
      });

    const captured: Array<{ content: Blob | string; filename: string }> = [];
    (window as any).__mtTestSaveAs = (content: Blob | string, filename: string) => {
      captured.push({ content, filename });
    };
    try {
      component.statisticsExportFilename = 'rate-table';
      component.plotExportFilename = 'rate-plot.svg';
      component.openExport();
      component.downloadStatisticsTable();

      component.outlierReportFilename = 'rate-outliers.pdf';
      component.outlierReportFileType = 'markdown';
      await component.downloadOutlierReport();

      component.plotExportFileType = 'png';
      component.plotExportScale = 1.5;
      component.plotExportQuality = 0.8;
      component.updateCalculatedPlotExportResolution();
      component.downloadRegressionPlot();

      const renderedSvg = host.querySelector('svg') as SVGSVGElement;
      const expectedWidth = Math.round(Number(renderedSvg.getAttribute('width')) * 1.5);
      const expectedHeight = Math.round(Number(renderedSvg.getAttribute('height')) * 1.5);
      expect(component.calculatedPlotExportResolution).toBe(`${expectedWidth} x ${expectedHeight}`);
      expect(exportService.setExportOptions).toHaveBeenCalledWith({
        filename: 'rate-plot',
        filetype: 'png',
        scale: 1.5,
        quality: 0.8,
      });
      expect(exportService.requestExport).toHaveBeenCalledWith([exportHost], true, false, true);

      component.plotExportFileType = 'svg';
      component.downloadRegressionPlot();

      const pdfDownload = spyOn<any>(component, 'downloadOutlierReportPdf').and.resolveTo();
      component.outlierReportFilename = 'rate-outliers.md';
      component.outlierReportFileType = 'pdf';
      await component.downloadOutlierReport();
      expect(pdfDownload).toHaveBeenCalled();
      const pdfDownloadArgs = pdfDownload.calls.mostRecent().args as any[];
      expect(pdfDownloadArgs[0].title).toBe('Evolutionary Rate Outlier Report');
      expect(pdfDownloadArgs[0].regressionPlotSvg).toContain('data-testid="evolutionary-rate-regression-line"');
      expect(pdfDownloadArgs[0].regressionPlotSvg).toContain('evolutionary-rate-report-vector-point');
      expect(pdfDownloadArgs[0].regressionPlotSvg).toContain('data-testid="evolutionary-rate-report-keys"');
      expect(pdfDownloadArgs[0].regressionPlotSvg).toContain('data-testid="report-node-color-key"');
      expect(pdfDownloadArgs[0].regressionPlotSvg).toContain('data-testid="report-node-shape-key"');
      expect(pdfDownloadArgs[0].regressionPlotSvg).not.toContain('<image');
      expect(exportService.exportTableAsSVG.calls.allArgs()).toContain([nodeColorTable, true, false, 20]);
      expect(exportService.exportTableAsSVG.calls.allArgs()).toContain([nodeShapeTable, true, true, 20]);
      const reportSvgDocument = new DOMParser().parseFromString(
        pdfDownloadArgs[0].regressionPlotSvg,
        'image/svg+xml'
      );
      const reportViewBox = String(reportSvgDocument.documentElement.getAttribute('viewBox'))
        .split(/\s+/)
        .map(Number);
      expect(reportViewBox[2]).toBe(Number(renderedSvg.getAttribute('width')));
      expect(reportViewBox[3]).toBe(Number(renderedSvg.getAttribute('height')) + 94);
      expect(pdfDownloadArgs[1]).toBe('rate-outliers.pdf');
    } finally {
      delete (window as any).__mtTestSaveAs;
    }

    expect(component.showExportDialog).toBeTrue();
    expect(component.canExportOutlierReport).toBeTrue();
    expect(component.outlierCandidateCount).toBe(0);
    expect(captured.map(item => item.filename)).toEqual(['rate-table.csv', 'rate-outliers.md']);
    expect(captured[0].content instanceof Blob).toBeTrue();
    const statisticsBytes = new Uint8Array(await (captured[0].content as Blob).arrayBuffer());
    expect(Array.from(statisticsBytes.slice(0, 3))).toEqual([0xEF, 0xBB, 0xBF]);
    const statisticsCsv = new TextDecoder('utf-8').decode(statisticsBytes);
    const statisticsRows = statisticsCsv.split('\r\n');
    expect(statisticsRows).toContain('Date range,2020-01-01 – 2021-01-01 (1.00 years)');
    expect(statisticsRows).toContain('Slope (rate),2');
    expect(statisticsRows).toContain('Residual Mean Squared,0');
    const outlierReport = await (captured[1].content as Blob).text();
    expect(outlierReport).toContain('# Evolutionary Rate Outlier Report');
    expect(outlierReport).toContain('## Regression plot');
    expect(outlierReport).toContain('data-testid="evolutionary-rate-regression-line"');
    expect(outlierReport).toContain('evolutionary-rate-report-vector-point');
    expect(outlierReport).toContain('data-testid="evolutionary-rate-report-keys"');
    expect(outlierReport).toContain('Node color key');
    expect(outlierReport).toContain('Node shape key');
    expect(outlierReport).not.toContain('<image');
    expect(outlierReport).toContain('At least 3 analyzable points are required');
    expect(outlierReport).toContain('https://beast.community/tempest_tutorial');
    expect(exportService.requestSVGExport).toHaveBeenCalled();
    const svgExport = exportService.requestSVGExport.calls.mostRecent().args;
    expect(svgExport[1]).toContain('data-testid="evolutionary-rate-plot"');
    expect(svgExport[1]).toContain('data-testid="evolutionary-rate-export-statistics"');
    expect(svgExport[1]).toContain('Residual Mean Squared');
    expect(svgExport.slice(2)).toEqual([true, false, true]);

    component.selectedTableVisibility = 'Hide';
    component.downloadRegressionPlot();
    const svgExportWithoutTable = exportService.requestSVGExport.calls.mostRecent().args;
    expect(svgExportWithoutTable[1]).not.toContain('data-testid="evolutionary-rate-export-statistics"');
  });
});
