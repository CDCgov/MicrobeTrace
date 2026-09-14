/// <reference types="cypress" />

import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from './journey-helpers';

type DistanceMetric = 'tn93' | 'snps';
type FileDatatype = 'link' | 'node' | 'matrix' | 'fasta' | 'newick' | 'MT/other';
type DefaultView = '2D Network' | 'Table' | 'Map' | 'Phylogenetic Tree' | 'Alignment View';
export type PerformanceRendererMode = 'cytoscape-canvas' | 'cytoscape-webgl' | 'sigma';

export type PerformanceFileLoadSpec = {
  name: string;
  datatype: FileDatatype;
  field1?: string;
  field2?: string;
  field3?: string;
};

export type PerformanceScenario = {
  id: string;
  title: string;
  files: PerformanceFileLoadSpec[];
  preLaunch: {
    metric: DistanceMetric;
    threshold: number;
    defaultView?: DefaultView;
  };
  expected: {
    nodes: number;
    totalLinks?: number;
    visibleLinks?: number;
    sequences?: number;
  };
  viewChecks?: Array<'alignment' | 'phylogeneticTree'>;
  interactions?: boolean | TwoDInteractionMeasurementOptions;
  timeoutMs?: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  renderer?: PerformanceRendererMode;
  rendererProfile?: 'legacy' | 'optimized';
};

export type PerformanceCounts = {
  nodes: number;
  visibleNodes: number;
  totalLinks: number;
  visibleLinks: number;
  totalClusters: number;
  visibleClusters: number;
  singletonNodes: number;
  sequencesWithData: number;
  cytoscapeVisibleEdges: number | null;
  cytoscapeTotalNodes: number | null;
  cytoscapeTotalEdges: number | null;
  rendererResidentNodes: number | null;
  rendererResidentEdges: number | null;
  rendererDrawnNodes: number | null;
  rendererDrawnEdges: number | null;
  rendererGroupCount: number | null;
  rendererRenderedGroupHullCount: number | null;
  rendererCompoundNodeCount: number | null;
  rendererGeographicOverlayActive: boolean | null;
  rendererGeographicPositionedNodeCount: number | null;
  rendererMixedValueDonutNodeCount: number | null;
  rendererQcOverlayNodeCount: number | null;
  rendererUncertaintyOverlayNodeCount: number | null;
  filteredNodes: number | null;
  filteredLinks: number | null;
  representedNodes: number | null;
  representedLinks: number | null;
  drawnNodes: number | null;
  drawnEdges: number | null;
  drawnLabels: number | null;
  lodLevel: number | null;
};

export type HeapSnapshot = {
  initialUsedJSHeapSize: number | null;
  finalUsedJSHeapSize: number | null;
  deltaUsedJSHeapSize: number | null;
};

export type BrowserProcessMemorySnapshot = {
  phase: string;
  capturedAt: string;
  platform: string;
  browserName: string | null;
  available: boolean;
  reason: string | null;
  rootPid: number | null;
  processCount: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  summedProcessPeakWorkingSetBytes: number | null;
  processTypes: Record<string, {
    count: number;
    workingSetBytes: number;
    privateBytes: number;
  }>;
  gpu: {
    available: boolean;
    reason: string | null;
    processCount: number;
    dedicatedBytes: number | null;
    sharedBytes: number | null;
    residentBytes: number | null;
    totalCommittedBytes: number | null;
  };
};

export type BrowserMemorySummary = {
  protocol: 'isolated-browser-process-tree-with-gpu';
  samples: BrowserProcessMemorySnapshot[];
  initial: BrowserProcessMemorySnapshot | null;
  final: BrowserProcessMemorySnapshot | null;
  peakObserved: {
    workingSetBytes: number | null;
    privateBytes: number | null;
    gpuResidentBytes: number | null;
    gpuTotalCommittedBytes: number | null;
  };
  delta: {
    workingSetBytes: number | null;
    privateBytes: number | null;
    gpuResidentBytes: number | null;
    gpuTotalCommittedBytes: number | null;
  };
};

export type LongTaskSummary = {
  count: number;
  maxDurationMs: number;
  totalDurationMs: number;
};

export type PerformanceMeasurement = {
  scenarioId: string;
  startedAt: string;
  metrics: Record<string, number | null>;
  counts: PerformanceCounts;
  heap: HeapSnapshot;
  browserMemory?: BrowserMemorySummary;
  longTasks: LongTaskSummary;
  app: {
    loadTimeMs: number | null;
    performance?: unknown;
    patristic?: unknown;
    renderer?: RendererComparisonSnapshot | null;
  };
};

export type RendererComparisonSnapshot = {
  requestedMode: PerformanceRendererMode;
  activeMode: PerformanceRendererMode;
  webglRequested: boolean;
  webglActive: boolean;
  fallbackReason: string | null;
  residentNodeCount: number;
  residentEdgeCount: number;
  drawnNodeCount: number;
  drawnEdgeCount: number;
  groupCount: number;
  renderedGroupHullCount: number;
  compoundNodeCount: number;
  geographicOverlayActive: boolean;
  geographicPositionedNodeCount: number;
  mixedValueDonutNodeCount: number;
  qcOverlayNodeCount: number;
  uncertaintyOverlayNodeCount: number;
  nodeFeatureRenderingMode: 'canvas-overlay' | 'sigma-webgl-program';
};

export type TwoDInteractionMeasurementOptions = {
  dragNodeId?: string;
  restoreThreshold?: number;
  thresholdDuringChange?: number;
  panDelta?: { x: number; y: number };
  zoomFactor?: number;
  zoomRenderedPosition?: { x: number; y: number };
  frameObserveMs?: number;
  thresholdObserveMs?: number;
  settleAfterRestoreMs?: number;
  restoreTimeoutMs?: number;
};

export type PerfWindow = Window & {
  gc?: () => void;
  commonService: any;
  cytoscapeInstance?: any;
  sigmaPocInstance?: any;
  mtRendererComparison?: {
    getDiagnostics: () => RendererComparisonSnapshot;
    getCollapsedGroupIds?: () => string[];
    setCollapsedGroups?: (groupLabelsOrIds: string[]) => Promise<void>;
    exportComposite?: () => {
      width: number;
      height: number;
      pixelRatio: number;
      canvasLayerCount: number;
      pngDataUrl: string;
      svg: string;
      metadata: Record<string, any>;
    };
    getViewState?: () => {
      centerX: number;
      centerY: number;
      graphUnitsPerPixel: number;
      edgeDetailMode: 'overview' | 'detail' | 'all';
    } | null;
    setViewState?: (state: {
      centerX: number;
      centerY: number;
      graphUnitsPerPixel: number;
      edgeDetailMode: 'overview' | 'detail' | 'all';
    }) => void;
    getKeyboardState?: () => {
      focusedNodeId: string | null;
      liveStatus: string;
    };
  };
  __mtPerfLongTasks?: Array<{ duration: number; startTime: number; name: string }>;
  __mtPerfLongTaskObserver?: PerformanceObserver;
};

type TimingMarks = {
  uploadStart: number;
  uploadComplete: number;
  launchStart: number;
  fullyLoaded: number;
  viewStart: number;
  viewReady: number;
};

function asJourneyProfile(scenario: PerformanceScenario): any {
  return {
    id: scenario.id,
    title: scenario.title,
    tags: ['performance'],
    files: scenario.files,
    preLaunch: scenario.preLaunch,
    expectations: {},
  };
}

function readHeapUsed(win: Window): number | null {
  const memory = (win.performance as any)?.memory;
  const value = memory?.usedJSHeapSize;
  return typeof value === 'number' ? value : null;
}

function difference(finalValue: number | null, initialValue: number | null): number | null {
  return finalValue !== null && initialValue !== null ? finalValue - initialValue : null;
}

function maxAvailable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.max(...available) : null;
}

function summarizeBrowserMemory(
  samples: BrowserProcessMemorySnapshot[],
): BrowserMemorySummary {
  const availableSamples = samples.filter(sample => sample.available);
  const initial = availableSamples[0] || samples[0] || null;
  const final = availableSamples[availableSamples.length - 1] || samples[samples.length - 1] || null;

  return {
    protocol: 'isolated-browser-process-tree-with-gpu',
    samples,
    initial,
    final,
    peakObserved: {
      workingSetBytes: maxAvailable(availableSamples.map(sample => sample.workingSetBytes)),
      privateBytes: maxAvailable(availableSamples.map(sample => sample.privateBytes)),
      gpuResidentBytes: maxAvailable(availableSamples.map(sample => sample.gpu.residentBytes)),
      gpuTotalCommittedBytes: maxAvailable(
        availableSamples.map(sample => sample.gpu.totalCommittedBytes),
      ),
    },
    delta: {
      workingSetBytes: difference(final?.workingSetBytes ?? null, initial?.workingSetBytes ?? null),
      privateBytes: difference(final?.privateBytes ?? null, initial?.privateBytes ?? null),
      gpuResidentBytes: difference(
        final?.gpu.residentBytes ?? null,
        initial?.gpu.residentBytes ?? null,
      ),
      gpuTotalCommittedBytes: difference(
        final?.gpu.totalCommittedBytes ?? null,
        initial?.gpu.totalCommittedBytes ?? null,
      ),
    },
  };
}

function captureBrowserMemorySample(
  measurement: PerformanceMeasurement,
  phase: string,
): Cypress.Chainable<PerformanceMeasurement> {
  if (!Cypress.env('rendererMemory')) return cy.wrap(measurement, { log: false });

  return cy.task('perf:captureBrowserMemory', { phase }, { timeout: 30000 })
    .then((snapshot: BrowserProcessMemorySnapshot) => {
      const samples = [...(measurement.browserMemory?.samples || []), snapshot];
      measurement.browserMemory = summarizeBrowserMemory(samples);
      return measurement;
    });
}

function summarizeLongTasks(win: PerfWindow): LongTaskSummary {
  const longTasks = win.__mtPerfLongTasks || [];
  return {
    count: longTasks.length,
    maxDurationMs: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
    totalDurationMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
  };
}

function readRendererComparison(win: PerfWindow): RendererComparisonSnapshot | null {
  try {
    return win.mtRendererComparison?.getDiagnostics() || null;
  } catch (_error) {
    return null;
  }
}

export function collectPerformanceCounts(win: PerfWindow): PerformanceCounts {
  const session = win.commonService?.session || {};
  const data = session.data || {};
  const nodes = data.nodes || [];
  const links = data.links || [];
  const clusters = data.clusters || [];
  const adaptiveState = session.meta?.adaptiveNetwork;
  const fullSummary = adaptiveState?.fullGraphSummary;
  const adaptiveView = adaptiveState?.lastView;
  const renderer = readRendererComparison(win);

  return {
    nodes: nodes.length,
    visibleNodes: nodes.filter((node: any) => node.visible !== false).length,
    totalLinks: links.length,
    visibleLinks: links.filter((link: any) => link.visible === true).length,
    totalClusters: clusters.length,
    visibleClusters: clusters.filter((cluster: any) => cluster.visible === true).length,
    singletonNodes: nodes.filter((node: any) => node.visible !== false && Number(node.degree || 0) === 0).length,
    sequencesWithData: nodes.filter((node: any) => typeof node.seq === 'string' && node.seq.length > 0).length,
    cytoscapeVisibleEdges: win.cytoscapeInstance?.edges
      ? win.cytoscapeInstance.edges(':visible').length
      : null,
    cytoscapeTotalNodes: win.cytoscapeInstance?.nodes
      ? win.cytoscapeInstance.nodes().length
      : null,
    cytoscapeTotalEdges: win.cytoscapeInstance?.edges
      ? win.cytoscapeInstance.edges().length
      : null,
    rendererResidentNodes: renderer?.residentNodeCount ?? null,
    rendererResidentEdges: renderer?.residentEdgeCount ?? null,
    rendererDrawnNodes: renderer?.drawnNodeCount ?? null,
    rendererDrawnEdges: renderer?.drawnEdgeCount ?? null,
    rendererGroupCount: renderer?.groupCount ?? null,
    rendererRenderedGroupHullCount: renderer?.renderedGroupHullCount ?? null,
    rendererCompoundNodeCount: renderer?.compoundNodeCount ?? null,
    rendererGeographicOverlayActive: renderer?.geographicOverlayActive ?? null,
    rendererGeographicPositionedNodeCount: renderer?.geographicPositionedNodeCount ?? null,
    rendererMixedValueDonutNodeCount: renderer?.mixedValueDonutNodeCount ?? null,
    rendererQcOverlayNodeCount: renderer?.qcOverlayNodeCount ?? null,
    rendererUncertaintyOverlayNodeCount: renderer?.uncertaintyOverlayNodeCount ?? null,
    filteredNodes: typeof fullSummary?.filteredNodeCount === 'number'
      ? fullSummary.filteredNodeCount
      : null,
    filteredLinks: typeof fullSummary?.filteredLinkCount === 'number'
      ? fullSummary.filteredLinkCount
      : null,
    representedNodes: typeof adaptiveView?.representedNodeCount === 'number'
      ? adaptiveView.representedNodeCount
      : null,
    representedLinks: typeof adaptiveView?.representedLinkCount === 'number'
      ? adaptiveView.representedLinkCount
      : null,
    drawnNodes: typeof adaptiveView?.drawnNodeCount === 'number'
      ? adaptiveView.drawnNodeCount
      : null,
    drawnEdges: typeof adaptiveView?.drawnEdgeCount === 'number'
      ? adaptiveView.drawnEdgeCount
      : null,
    drawnLabels: typeof adaptiveView?.visibleLabelCount === 'number'
      ? adaptiveView.visibleLabelCount
      : null,
    lodLevel: typeof adaptiveView?.lodLevel === 'number'
      ? adaptiveView.lodLevel
      : null,
  };
}

export function getPatristicPerformance(win: PerfWindow): unknown {
  return win.commonService?.session?.meta?.performance?.patristic;
}

export function getAppPerformance(win: PerfWindow): unknown {
  return win.commonService?.session?.meta?.performance;
}

export function startPerformanceCapture(): void {
  cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    perfWindow.__mtPerfLongTasks = [];
    perfWindow.__mtPerfLongTaskObserver?.disconnect();

    const Observer = perfWindow.PerformanceObserver;
    if (!Observer) return;

    try {
      const observer = new Observer((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          perfWindow.__mtPerfLongTasks?.push({
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name,
          });
        });
      });
      observer.observe({ type: 'longtask', buffered: true } as any);
      perfWindow.__mtPerfLongTaskObserver = observer;
    } catch (_error) {
      perfWindow.__mtPerfLongTaskObserver = undefined;
    }
  });
}

export function stopPerformanceCapture(): void {
  cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    perfWindow.__mtPerfLongTaskObserver?.disconnect();
    perfWindow.__mtPerfLongTaskObserver = undefined;
  });
}

function buildMeasurement(
  scenario: PerformanceScenario,
  marks: TimingMarks,
  initialHeap: number | null,
  win: PerfWindow,
): PerformanceMeasurement {
  const finalHeap = readHeapUsed(win);
  const counts = collectPerformanceCounts(win);
  const appLoadTime = win.commonService?.session?.meta?.loadTime;

  return {
    scenarioId: scenario.id,
    startedAt: new Date().toISOString(),
    metrics: {
      uploadToLaunchMs: marks.launchStart - marks.uploadStart,
      uploadToFileReadyMs: marks.uploadComplete - marks.uploadStart,
      launchToFullyLoadedMs: marks.fullyLoaded - marks.launchStart,
      fullyLoadedToViewReadyMs: marks.viewReady - marks.fullyLoaded,
      targetViewReadyMs: marks.viewReady - marks.viewStart,
      totalMeasuredMs: marks.viewReady - marks.uploadStart,
    },
    counts,
    heap: {
      initialUsedJSHeapSize: initialHeap,
      finalUsedJSHeapSize: finalHeap,
      deltaUsedJSHeapSize:
        initialHeap !== null && finalHeap !== null ? finalHeap - initialHeap : null,
    },
    longTasks: summarizeLongTasks(win),
    app: {
      loadTimeMs: typeof appLoadTime === 'number' ? appLoadTime : null,
      performance: getAppPerformance(win),
      patristic: getPatristicPerformance(win),
      renderer: readRendererComparison(win),
    },
  };
}

export function assertScenarioExpectedCounts(
  scenario: PerformanceScenario,
  counts: PerformanceCounts,
): void {
  expect(counts.nodes, `${scenario.id} node count`).to.equal(scenario.expected.nodes);

  if (scenario.expected.totalLinks !== undefined) {
    expect(counts.totalLinks, `${scenario.id} total link count`).to.equal(scenario.expected.totalLinks);
  }

  if (scenario.expected.visibleLinks !== undefined) {
    expect(counts.visibleLinks, `${scenario.id} visible link count`).to.equal(scenario.expected.visibleLinks);
    if (counts.cytoscapeVisibleEdges !== null) {
      expect(counts.cytoscapeVisibleEdges, `${scenario.id} Cytoscape visible edge count`)
        .to.equal(scenario.expected.visibleLinks);
    }
  }

  if (scenario.expected.sequences !== undefined) {
    expect(counts.sequencesWithData, `${scenario.id} sequence count`).to.equal(scenario.expected.sequences);
  }
}

export function launchPerformanceScenarioToTwoD(
  scenario: PerformanceScenario,
  timeout = 120000,
  beforeTwoD?: (win: PerfWindow) => void | Promise<void>,
): Cypress.Chainable<PerformanceMeasurement> {
  const profile = asJourneyProfile(scenario);
  const marks = {} as TimingMarks;
  let initialHeap: number | null = null;
  let initialBrowserMemory: BrowserProcessMemorySnapshot | null = null;

  visitAppAndAcceptEula({
    extraQuery: scenario.renderer
      ? {
        renderer: scenario.renderer,
        rendererProfile: scenario.rendererProfile || 'optimized',
      }
      : undefined,
  });
  startPerformanceCapture();

  cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    if (Cypress.env('rendererMemory')) {
      expect(perfWindow.gc, 'forced GC hook for isolated memory benchmark').to.be.a('function');
      perfWindow.gc?.();
      perfWindow.gc?.();
    }
    marks.uploadStart = perfWindow.performance.now();
    initialHeap = readHeapUsed(perfWindow);
  });

  if (Cypress.env('rendererMemory')) {
    cy.task('perf:captureBrowserMemory', { phase: 'before-dataset' }, { timeout: 30000 })
      .then((snapshot: BrowserProcessMemorySnapshot) => {
        initialBrowserMemory = snapshot;
      });
  }

  cy.loadFiles(scenario.files);

  cy.window().then((win: unknown) => {
    marks.uploadComplete = (win as Window).performance.now();
  });

  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);

  cy.window().then((win: unknown) => {
    marks.launchStart = (win as Window).performance.now();
  });

  launchAndWaitForProcessing(timeout);

  cy.window().then((win: unknown) => {
    marks.fullyLoaded = (win as Window).performance.now();
    marks.viewStart = marks.fullyLoaded;
  });

  if (beforeTwoD) {
    cy.window().then((win: unknown) => beforeTwoD(win as PerfWindow));
  }

  ensureTwoDNetworkView();

  return cy.window().then((win: unknown) => {
    marks.viewReady = (win as Window).performance.now();
    const measurement = buildMeasurement(scenario, marks, initialHeap, win as PerfWindow);
    if (initialBrowserMemory) {
      measurement.browserMemory = summarizeBrowserMemory([initialBrowserMemory]);
    }
    assertScenarioExpectedCounts(scenario, measurement.counts);
    return measurement;
  }).then(measurement => captureBrowserMemorySample(measurement, 'view-ready'));
}

export function appendMeasuredView(
  measurement: PerformanceMeasurement,
  viewMetricPrefix: string,
  openView: () => void,
): Cypress.Chainable<PerformanceMeasurement> {
  let viewStart = 0;

  cy.window().then((win: unknown) => {
    viewStart = (win as Window).performance.now();
  });

  openView();

  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    const viewReady = perfWindow.performance.now();
    return {
      ...measurement,
      metrics: {
        ...measurement.metrics,
        [`${viewMetricPrefix}ViewReadyMs`]: viewReady - viewStart,
      },
      counts: collectPerformanceCounts(perfWindow),
      heap: {
        ...measurement.heap,
        finalUsedJSHeapSize: readHeapUsed(perfWindow),
        deltaUsedJSHeapSize:
          measurement.heap.initialUsedJSHeapSize !== null && readHeapUsed(perfWindow) !== null
            ? readHeapUsed(perfWindow)! - measurement.heap.initialUsedJSHeapSize
            : null,
      },
      longTasks: summarizeLongTasks(perfWindow),
      app: {
        ...measurement.app,
        performance: getAppPerformance(perfWindow),
        patristic: getPatristicPerformance(perfWindow),
        renderer: readRendererComparison(perfWindow),
      },
    };
  });
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export function measureFrameGaps(
  metricPrefix: string,
  action: (win: PerfWindow) => void,
  observeMs = 500,
): Cypress.Chainable<Record<string, number | null>> {
  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;

    return new Cypress.Promise<Record<string, number | null>>((resolve, reject) => {
      const gaps: number[] = [];
      const start = perfWindow.performance.now();
      let lastFrame = start;
      let active = true;
      let actionDurationMs = 0;

      const tick = (now: number) => {
        if (!active) return;
        gaps.push(now - lastFrame);
        lastFrame = now;
        perfWindow.requestAnimationFrame(tick);
      };

      try {
        perfWindow.requestAnimationFrame(tick);
        const actionStart = perfWindow.performance.now();
        action(perfWindow);
        actionDurationMs = perfWindow.performance.now() - actionStart;
      } catch (error) {
        active = false;
        reject(error);
        return;
      }

      perfWindow.setTimeout(() => {
        active = false;
        const end = perfWindow.performance.now();
        const maxGap = gaps.reduce((max, gap) => Math.max(max, gap), 0);
        const totalGap = gaps.reduce((sum, gap) => sum + gap, 0);

        resolve({
          [`${metricPrefix}ActionMs`]: actionDurationMs,
          [`${metricPrefix}FrameCount`]: gaps.length,
          [`${metricPrefix}MaxFrameGapMs`]: gaps.length ? maxGap : null,
          [`${metricPrefix}P95FrameGapMs`]: percentile(gaps, 95),
          [`${metricPrefix}AverageFrameGapMs`]: gaps.length ? totalGap / gaps.length : null,
          [`${metricPrefix}ObservedMs`]: end - start,
        });
      }, observeMs);
    });
  });
}

function measureAnimatedFrameGaps(
  metricPrefix: string,
  update: (win: PerfWindow, progress: number) => void,
  observeMs = 800,
): Cypress.Chainable<Record<string, number | null>> {
  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;

    return new Cypress.Promise<Record<string, number | null>>((resolve, reject) => {
      const gaps: number[] = [];
      const start = perfWindow.performance.now();
      let lastFrame = start;

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / observeMs);
        gaps.push(now - lastFrame);
        lastFrame = now;

        try {
          update(perfWindow, progress);
        } catch (error) {
          reject(error);
          return;
        }

        if (progress < 1) {
          perfWindow.requestAnimationFrame(tick);
          return;
        }

        const maxGap = gaps.reduce((max, gap) => Math.max(max, gap), 0);
        const totalGap = gaps.reduce((sum, gap) => sum + gap, 0);
        const averageGap = gaps.length ? totalGap / gaps.length : null;
        resolve({
          [`${metricPrefix}FrameCount`]: gaps.length,
          [`${metricPrefix}MaxFrameGapMs`]: gaps.length ? maxGap : null,
          [`${metricPrefix}P95FrameGapMs`]: percentile(gaps, 95),
          [`${metricPrefix}AverageFrameGapMs`]: averageGap,
          [`${metricPrefix}AverageFps`]: averageGap ? 1000 / averageGap : null,
          [`${metricPrefix}ObservedMs`]: now - start,
        });
      };

      perfWindow.requestAnimationFrame(tick);
    });
  });
}

export function prepareRendererFullDetail(
  measurement: PerformanceMeasurement,
): Cypress.Chainable<PerformanceMeasurement> {
  const overviewDrawnEdges = measurement.app.renderer?.drawnEdgeCount ?? null;
  measurement.metrics.rendererOverviewDrawnEdges = overviewDrawnEdges;

  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    if (readRendererComparison(perfWindow)?.activeMode === 'sigma') {
      // Persist the requested mode in product state as well as the adapter.
      // Feature/style changes can queue a renderer refresh; without this, that
      // refresh can restore the prior overview mode after the probe requests
      // full detail.
      perfWindow.commonService.session.style.widgets['network-edge-detail-mode'] = 'all';
      const viewState = perfWindow.mtRendererComparison?.getViewState?.();
      if (viewState && perfWindow.mtRendererComparison?.setViewState) {
        perfWindow.mtRendererComparison.setViewState({
          ...viewState,
          edgeDetailMode: 'all',
        });
      } else {
        perfWindow.sigmaPocInstance?.setEdgeDetailMode('all');
      }
    }
  }).then(() => {
    cy.window({ timeout: 30000 }).should((win: unknown) => {
      const diagnostics = readRendererComparison(win as PerfWindow);
      if (diagnostics?.activeMode === 'sigma') {
        expect(diagnostics.drawnEdgeCount, 'Sigma full-detail edge projection')
          .to.equal(diagnostics.residentEdgeCount);
      }
    });
    return refreshPerformanceMeasurement(measurement, 'full-detail');
  }).then((refreshed) => {
    refreshed.metrics.rendererFullDetailDrawnEdges =
      refreshed.app.renderer?.drawnEdgeCount ?? null;
    return refreshed;
  });
}

/**
 * Runs equivalent renderer-level probes without relying on either library's
 * pointer-event implementation. This keeps the workload repeatable while the
 * frame scheduler still captures each renderer's redraw cost.
 */
export function measureRendererComparisonInteractions(
  measurement: PerformanceMeasurement,
  observeMs = 800,
): Cypress.Chainable<PerformanceMeasurement> {
  let cytoscapeInitialPan: { x: number; y: number } | null = null;
  let sigmaInitialCamera: any = null;

  // Keep renderer creation, queued feature-layer refreshes, and font/canvas
  // warm-up out of the steady-state navigation probe. Two frames after the
  // idle window also ensure each renderer has presented its settled state.
  return cy.wait(500, { log: false }).then(() => cy.window().then((win: unknown) => (
    new Cypress.Promise<void>((resolve) => {
      (win as PerfWindow).requestAnimationFrame(() => {
        (win as PerfWindow).requestAnimationFrame(() => resolve());
      });
    })
  ))).then(() => measureAnimatedFrameGaps('rendererPan', (win, progress) => {
    const mode = readRendererComparison(win)?.activeMode;
    if (mode === 'sigma') {
      const camera = win.sigmaPocInstance?.getRenderer()?.getCamera();
      if (!camera) throw new Error('Sigma camera is unavailable for the comparison probe');
      sigmaInitialCamera ||= camera.getState();
      camera.setState({
        ...sigmaInitialCamera,
        x: sigmaInitialCamera.x + progress * 0.08,
        y: sigmaInitialCamera.y - progress * 0.05,
      });
      return;
    }

    const cyInstance = requireCytoscape(win);
    cytoscapeInitialPan ||= cyInstance.pan();
    cyInstance.pan({
      x: cytoscapeInitialPan.x + progress * 120,
      y: cytoscapeInitialPan.y - progress * 80,
    });
  }, observeMs))
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      let cytoscapeInitialZoom: number | null = null;
      let sigmaZoomCamera: any = null;
      return measureAnimatedFrameGaps('rendererZoom', (win, progress) => {
        const mode = readRendererComparison(win)?.activeMode;
        if (mode === 'sigma') {
          const camera = win.sigmaPocInstance?.getRenderer()?.getCamera();
          if (!camera) throw new Error('Sigma camera is unavailable for the comparison probe');
          sigmaZoomCamera ||= camera.getState();
          camera.setState({
            ...sigmaZoomCamera,
            ratio: sigmaZoomCamera.ratio / (1 + progress * 0.4),
          });
          return;
        }

        const cyInstance = requireCytoscape(win);
        cytoscapeInitialZoom ??= cyInstance.zoom();
        cyInstance.zoom(cytoscapeInitialZoom * (1 + progress * 0.4));
      }, observeMs);
    })
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      return cy.window().then((win: unknown) => {
        const perfWindow = win as PerfWindow;
        const mode = readRendererComparison(perfWindow)?.activeMode;
        const selectionStartedAt = perfWindow.performance.now();
        let selectedCount = 0;

        if (mode === 'sigma') {
          const adapter = perfWindow.sigmaPocInstance;
          const nodeId = adapter?.getGraph()?.nodes()?.[0];
          if (!adapter || !nodeId) throw new Error('Sigma node is unavailable for selection probe');
          adapter.selectNodes([nodeId]);
          selectedCount = adapter.getSelectedNodeIds().length;
        } else {
          const cyInstance = requireCytoscape(perfWindow);
          const node = cyInstance.nodes().filter((candidate: any) => !candidate.isParent())[0];
          if (!node) throw new Error('Cytoscape node is unavailable for selection probe');
          cyInstance.elements().unselect();
          node.select();
          selectedCount = cyInstance.nodes(':selected').length;
        }

        measurement.metrics.rendererSelectionActionMs =
          perfWindow.performance.now() - selectionStartedAt;
        measurement.metrics.rendererSelectedNodeCount = selectedCount;
        expect(selectedCount, 'renderer selection count').to.equal(1);
      });
    })
    .then(() => refreshPerformanceMeasurement(measurement, 'after-interactions'));
}

function requireCytoscape(win: PerfWindow): any {
  const cyInstance = win.cytoscapeInstance;
  if (!cyInstance) {
    throw new Error('Cytoscape instance is not available for interaction measurement');
  }
  return cyInstance;
}

function requireCypressTestApi(win: PerfWindow): any {
  const testApi = (win as any).Cypress?.test;
  if (!testApi) {
    throw new Error('Cypress 2D interaction API is not available');
  }
  return testApi;
}

function mergeInteractionMetrics(
  measurement: PerformanceMeasurement,
  metrics: Record<string, number | null>,
): PerformanceMeasurement {
  Object.assign(measurement.metrics, metrics);
  return measurement;
}

export function measureTwoDInteractionResponsiveness(
  measurement: PerformanceMeasurement,
  options: TwoDInteractionMeasurementOptions = {},
): Cypress.Chainable<PerformanceMeasurement> {
  const panDelta = options.panDelta || { x: 120, y: -80 };
  const zoomFactor = options.zoomFactor ?? 0.85;
  const zoomRenderedPosition = options.zoomRenderedPosition || { x: 400, y: 300 };
  const frameObserveMs = options.frameObserveMs ?? 500;
  const thresholdObserveMs = options.thresholdObserveMs ?? 800;
  const settleAfterRestoreMs = options.settleAfterRestoreMs ?? 1000;
  const restoreTimeoutMs = options.restoreTimeoutMs ?? 30000;
  const thresholdDuringChange = options.thresholdDuringChange ?? 8;
  const restoreThreshold = options.restoreThreshold ?? 16;
  const expectedRestoredVisibleLinks = measurement.counts.visibleLinks;

  return measureFrameGaps('pan', (win) => {
    requireCytoscape(win).panBy(panDelta);
  }, frameObserveMs)
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      return measureFrameGaps('zoom', (win) => {
        const cyInstance = requireCytoscape(win);
        cyInstance.zoom({
          level: cyInstance.zoom() * zoomFactor,
          renderedPosition: zoomRenderedPosition,
        });
      }, frameObserveMs);
    })
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      return measureFrameGaps('dragNode', (win) => {
        const cyInstance = requireCytoscape(win);
        const fallbackNode = cyInstance.nodes(':visible').filter((candidate: any) => (
          !candidate.hasClass('parent') && candidate.children().length === 0
        ))[0];
        const nodeId = options.dragNodeId || fallbackNode?.id();
        if (!nodeId) throw new Error('No visible node available for drag measurement');
        requireCypressTestApi(win).dragNodeDelta(nodeId, 30, 18);
      }, frameObserveMs);
    })
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      return measureFrameGaps('boxSelect', (win) => {
        const cyInstance = requireCytoscape(win);
        const node = cyInstance.nodes(':visible').filter((candidate: any) => (
          !candidate.hasClass('parent') && candidate.children().length === 0
        ))[0];
        if (!node) throw new Error('No visible node available for box select measurement');
        const position = node.renderedPosition();
        requireCypressTestApi(win).selectNodesInRenderedBox(
          position.x - 24,
          position.y - 24,
          position.x + 24,
          position.y + 24,
        );
      }, frameObserveMs);
    })
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      return measureFrameGaps('thresholdChange', (win) => {
        const commonService = win.commonService;
        commonService.session.style.widgets['link-threshold'] = thresholdDuringChange;
        commonService.setLinkVisibility(false);
        commonService.updateNetworkVisuals(false, true);
      }, thresholdObserveMs);
    })
    .then((metrics) => {
      mergeInteractionMetrics(measurement, metrics);
      cy.window().then((win: unknown) => {
        const commonService = (win as PerfWindow).commonService;
        commonService.session.style.widgets['link-threshold'] = restoreThreshold;
        commonService.setLinkVisibility(false);
        commonService.updateNetworkVisuals(false, true);
      });
      cy.wait(settleAfterRestoreMs);
      cy.window({ timeout: restoreTimeoutMs }).should((win: unknown) => {
        const counts = collectPerformanceCounts(win as PerfWindow);
        expect(counts.visibleLinks, 'restored visible links after interaction threshold probe')
          .to.equal(expectedRestoredVisibleLinks);
      });
    })
    .then(() => refreshPerformanceMeasurement(measurement));
}

export function measureStatisticsRefresh(
  measurement: PerformanceMeasurement,
): Cypress.Chainable<PerformanceMeasurement> {
  return cy.window().then((win: unknown) => {
    (win as PerfWindow).commonService.updateStatistics();
  }).then(() => refreshPerformanceMeasurement(measurement));
}

export function refreshPerformanceMeasurement(
  measurement: PerformanceMeasurement,
  browserMemoryPhase = 'refresh',
): Cypress.Chainable<PerformanceMeasurement> {
  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    if (Cypress.env('rendererMemory')) {
      expect(perfWindow.gc, 'forced GC hook for isolated memory benchmark').to.be.a('function');
      perfWindow.gc?.();
      perfWindow.gc?.();
    }
    const finalHeap = readHeapUsed(perfWindow);
    const performance = getAppPerformance(perfWindow) as Record<string, any>;
    const renderer = readRendererComparison(perfWindow);
    const layoutEntry = renderer?.activeMode === 'sigma'
      ? performance?.render?.twoDSigmaPocLayout
      : performance?.render?.twoDPrecomputePositions;
    const rendererCreateEntry = renderer?.activeMode === 'sigma'
      ? performance?.render?.twoDSigmaPocRendererCreate
      : performance?.render?.twoDCreateCytoscape;
    if (typeof layoutEntry?.durationMs === 'number') {
      measurement.metrics.rendererLayoutMs = layoutEntry.durationMs;
    }
    if (typeof rendererCreateEntry?.durationMs === 'number') {
      measurement.metrics.rendererCreateMs = rendererCreateEntry.durationMs;
    }

    return {
      ...measurement,
      counts: collectPerformanceCounts(perfWindow),
      heap: {
        ...measurement.heap,
        finalUsedJSHeapSize: finalHeap,
        deltaUsedJSHeapSize:
          measurement.heap.initialUsedJSHeapSize !== null && finalHeap !== null
            ? finalHeap - measurement.heap.initialUsedJSHeapSize
            : null,
      },
      longTasks: summarizeLongTasks(perfWindow),
      app: {
        ...measurement.app,
        performance,
        patristic: getPatristicPerformance(perfWindow),
        renderer,
      },
    } as PerformanceMeasurement;
  }).then(refreshed => captureBrowserMemorySample(refreshed, browserMemoryPhase));
}

export function assertPerformanceTimingEntry(
  measurement: PerformanceMeasurement,
  category: string,
  name: string,
  requiredFields: string[] = [],
): Record<string, any> {
  const performance = measurement.app.performance as Record<string, any> | undefined;
  const entry = performance?.[category]?.[name];

  expect(entry, `${category}.${name}`).to.be.an('object');
  expect(entry.durationMs, `${category}.${name}.durationMs`).to.be.a('number');
  expect(entry.durationMs, `${category}.${name}.durationMs`).to.be.gte(0);

  requiredFields.forEach((field) => {
    expect(entry, `${category}.${name}.${field}`).to.have.property(field);
  });

  return entry;
}

export function writePerformanceResult(
  scenario: PerformanceScenario,
  measurement: PerformanceMeasurement,
): Cypress.Chainable<{ filePath: string; summaryPath: string; runId: string }> {
  return cy.task(
    'perf:writeResult',
    {
      scenarioId: scenario.id,
      scenario: {
        id: scenario.id,
        title: scenario.title,
        files: scenario.files,
        preLaunch: scenario.preLaunch,
        expected: scenario.expected,
        interactions: scenario.interactions,
        metadata: scenario.metadata,
        renderer: scenario.renderer,
        rendererProfile: scenario.rendererProfile,
      },
      metrics: measurement.metrics,
      counts: measurement.counts,
      heap: measurement.heap,
      browserMemory: measurement.browserMemory,
      longTasks: measurement.longTasks,
      app: measurement.app,
      browser: {
        name: Cypress.browser.name,
        family: Cypress.browser.family,
        channel: Cypress.browser.channel,
        displayName: Cypress.browser.displayName,
        majorVersion: Cypress.browser.majorVersion,
        version: Cypress.browser.version,
      },
      spec: {
        name: Cypress.spec.name,
        relative: Cypress.spec.relative,
      },
      cypress: {
        baseUrl: Cypress.config('baseUrl'),
        viewportWidth: Cypress.config('viewportWidth'),
        viewportHeight: Cypress.config('viewportHeight'),
      },
      timestamp: new Date().toISOString(),
    },
    { log: false },
  ).then((response) => {
    const typed = response as { filePath: string; summaryPath: string; runId: string };
    Cypress.log({
      name: 'perf:writeResult',
      message: typed.filePath,
    });
    return typed;
  });
}
