/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureRendererComparisonInteractions,
  prepareRendererFullDetail,
  refreshPerformanceMeasurement,
  writePerformanceResult,
  type PerfWindow,
  type PerformanceMeasurement,
  type PerformanceRendererMode,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeFeatureScale = Cypress.env('perfMode') && Cypress.env('rendererFeatureScale')
  ? describe
  : describe.skip;
const requestedRendererMode = String(Cypress.env('rendererMode') || 'paired');
const renderers: PerformanceRendererMode[] = requestedRendererMode === 'paired'
  ? ['cytoscape-webgl', 'sigma']
  : [requestedRendererMode as PerformanceRendererMode];
const configuredSampleCount = Number(Cypress.env('rendererSamples') || 1);
const sampleCount = Number.isFinite(configuredSampleCount)
  ? Math.max(1, Math.min(20, Math.floor(configuredSampleCount)))
  : 1;

const scenarioFor = (renderer: PerformanceRendererMode): PerformanceScenario => ({
  id: `renderer-${renderer}-feature-scale-1600n-3200l`,
  title: `Feature-rich renderer comparison (${renderer}): 1,600 nodes`,
  renderer,
  rendererProfile: 'optimized',
  files: [
    {
      name: 'renderer-comparison/feature-scale-nodes.csv',
      datatype: 'node',
      field1: '_id',
    },
    {
      name: 'performance/average-graph-links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
      field3: 'distance',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: 'Table',
  },
  expected: {
    nodes: 1600,
    totalLinks: 3200,
    visibleLinks: 3200,
  },
  metadata: {
    fixtureKind: 'deterministic-feature-scale',
    comparisonTier: 'feature-scale',
    memoryProtocol: Cypress.env('rendererMemory')
      ? 'fresh-browser-process-forced-gc-plus-os-and-gpu'
      : 'diagnostic-unisolated-js-heap',
    groups: 40,
    workload: [
      'initial-load',
      'geographic-overlay',
      'mixed-value-donuts',
      'qc-overlay',
      'uncertainty-overlay',
      'cluster-hulls',
      'pan',
      'zoom',
      'selection',
      'export',
      'collapse',
      'expand',
      'memory',
    ],
  },
});

function configureFeatureWorkload(win: PerfWindow): void {
  Object.assign(win.commonService.session.style.widgets, {
    'node-color-variable': 'Exposure',
    'node-qc-status-variable': 'QC Status',
    'node-qc-severity-variable': 'QC Severity',
    'node-qc-reason-variable': 'QC Reason',
    'node-uncertainty-variable': 'Uncertainty',
    'polygons-foci': 'Case ID',
    'polygons-show': true,
    'polygons-color-show': true,
    'polygons-label-show': true,
    'map-field-lat': 'Latitude',
    'map-field-lon': 'Longitude',
    'network-geographic-overlay': true,
  });
}

function assertFeatureScaleReady(
  scenario: PerformanceScenario,
  measurement: PerformanceMeasurement,
): void {
  const diagnostics = measurement.app.renderer;
  expect(diagnostics, 'renderer diagnostics').to.exist;
  expect(diagnostics?.requestedMode, 'requested renderer').to.equal(scenario.renderer);
  expect(diagnostics?.activeMode, 'active renderer').to.equal(scenario.renderer);
  expect(diagnostics?.webglActive, 'WebGL benchmark validity').to.equal(true);
  expect(diagnostics?.residentNodeCount, 'renderer resident nodes').to.equal(1600);
  expect(diagnostics?.residentEdgeCount, 'renderer resident edges').to.equal(3200);
  expect(diagnostics?.groupCount, 'renderer groups').to.equal(40);
  expect(diagnostics?.renderedGroupHullCount, 'rendered group hulls').to.equal(40);
  expect(diagnostics?.geographicOverlayActive, 'geographic overlay').to.equal(true);
  expect(diagnostics?.geographicPositionedNodeCount, 'geographic nodes').to.equal(1600);
  expect(diagnostics?.mixedValueDonutNodeCount, 'mixed-value donut nodes').to.equal(800);
  expect(diagnostics?.qcOverlayNodeCount, 'QC overlay nodes').to.equal(1600);
  expect(diagnostics?.uncertaintyOverlayNodeCount, 'uncertainty overlay nodes').to.equal(1600);
  expect(diagnostics?.nodeFeatureRenderingMode, 'feature rendering mode').to.equal(
    scenario.renderer === 'sigma' ? 'sigma-webgl-program' : 'canvas-overlay',
  );
}

function measureExportAndGrouping(
  measurement: PerformanceMeasurement,
): Cypress.Chainable<PerformanceMeasurement> {
  let groupLabels: string[] = [];

  return cy.window().then((win: any) => {
    const exportStartedAt = win.performance.now();
    const exported = win.mtRendererComparison.exportComposite();
    measurement.metrics.rendererCompositeExportMs = win.performance.now() - exportStartedAt;
    measurement.metrics.rendererCompositePngBytes = Math.floor(
      (exported.pngDataUrl.length - 'data:image/png;base64,'.length) * 0.75,
    );
    measurement.metrics.rendererCompositeSvgBytes = new Blob([exported.svg]).size;
    measurement.metrics.rendererCompositeCanvasLayers = exported.canvasLayerCount;
    expect(exported.metadata.mixedValueDonutNodeCount).to.equal(800);
    expect(exported.metadata.qcOverlayNodeCount).to.equal(1600);
    expect(exported.metadata.uncertaintyOverlayNodeCount).to.equal(1600);

    groupLabels = Array.from(new Set(
      win.commonService.session.data.nodes.map((node: any) => String(node['Case ID'])),
    ));
    expect(groupLabels).to.have.length(40);
    const collapseStartedAt = win.performance.now();
    return Promise.resolve(win.mtRendererComparison.setCollapsedGroups(groupLabels))
      .then(() => {
        measurement.metrics.rendererCollapseAllGroupsMs = win.performance.now() - collapseStartedAt;
      });
  }).then(() => {
    cy.window({ timeout: 30000 }).should((win: any) => {
      const diagnostics = win.mtRendererComparison.getDiagnostics();
      expect(win.mtRendererComparison.getCollapsedGroupIds()).to.have.length(40);
      expect(diagnostics.residentNodeCount).to.equal(40);
      expect(diagnostics.mixedValueDonutNodeCount).to.equal(40);
      expect(diagnostics.qcOverlayNodeCount).to.equal(40);
      expect(diagnostics.uncertaintyOverlayNodeCount).to.equal(40);
      expect(diagnostics.geographicPositionedNodeCount).to.equal(40);
      expect(diagnostics.renderedGroupHullCount).to.equal(0);
      expect(win.commonService.session.data.nodes).to.have.length(1600);
      expect(win.commonService.session.data.links).to.have.length(3200);
      measurement.metrics.rendererCollapsedNodeCount = diagnostics.residentNodeCount;
      measurement.metrics.rendererCollapsedEdgeCount = diagnostics.residentEdgeCount;
    });
  }).then(() => cy.window().then((win: any) => {
    const expandStartedAt = win.performance.now();
    return Promise.resolve(win.mtRendererComparison.setCollapsedGroups([]))
      .then(() => {
        measurement.metrics.rendererExpandAllGroupsMs = win.performance.now() - expandStartedAt;
      });
  })).then(() => {
    cy.window({ timeout: 30000 }).should((win: any) => {
      const diagnostics = win.mtRendererComparison.getDiagnostics();
      expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal([]);
      expect(diagnostics.residentNodeCount).to.equal(1600);
      expect(diagnostics.residentEdgeCount).to.equal(3200);
      expect(diagnostics.renderedGroupHullCount).to.equal(40);
    });
    return refreshPerformanceMeasurement(measurement, 'after-export-collapse-expand');
  });
}

function assertCompleteMemoryTelemetry(measurement: PerformanceMeasurement): void {
  if (!Cypress.env('rendererMemory')) return;

  const finalMemory = measurement.browserMemory?.final;
  if (finalMemory?.platform !== 'win32') return;

  expect(finalMemory.available, 'complete Chrome process-tree memory').to.equal(true);
  expect(finalMemory.processCount, 'tracked Chrome process count').to.be.greaterThan(1);
  expect(finalMemory.workingSetBytes, 'Chrome process-tree working set').to.be.greaterThan(0);
  expect(finalMemory.privateBytes, 'Chrome process-tree private memory').to.be.greaterThan(0);
  expect(finalMemory.gpu.available, 'Windows GPU process memory counters').to.equal(true);
  expect(finalMemory.gpu.totalCommittedBytes, 'Chrome graphics memory committed').to.be.greaterThan(0);
}

function runFeatureScaleScenario(
  scenario: PerformanceScenario,
  sampleIndex: number,
): Cypress.Chainable<unknown> {
  return launchPerformanceScenarioToTwoD(scenario, 300000, configureFeatureWorkload)
    .then((measurement) => {
      measurement.metrics.rendererSampleIndex = sampleIndex + 1;
      assertFeatureScaleReady(scenario, measurement);
      return prepareRendererFullDetail(measurement);
    })
    .then((measurement) => {
      expect(measurement.app.renderer?.drawnEdgeCount, 'full-detail edges').to.equal(3200);
      return measureRendererComparisonInteractions(measurement);
    })
    .then(measureExportAndGrouping)
    .then((measurement) => {
      assertCompleteMemoryTelemetry(measurement);
      return writePerformanceResult(scenario, measurement);
    });
}

describeFeatureScale(`Optimized feature-rich renderer comparison - ${requestedRendererMode}`, () => {
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const orderedRenderers = sampleIndex % 2 === 0 ? renderers : [...renderers].reverse();
    orderedRenderers.forEach(renderer => {
      it(`records ${renderer} feature-scale sample ${sampleIndex + 1} of ${sampleCount}`, () => (
        runFeatureScaleScenario(scenarioFor(renderer), sampleIndex)
      ));
    });
  }
});
