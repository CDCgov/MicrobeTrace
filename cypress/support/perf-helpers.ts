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
};

export type HeapSnapshot = {
  initialUsedJSHeapSize: number | null;
  finalUsedJSHeapSize: number | null;
  deltaUsedJSHeapSize: number | null;
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
  longTasks: LongTaskSummary;
  app: {
    loadTimeMs: number | null;
    performance?: unknown;
    patristic?: unknown;
  };
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
  commonService: any;
  cytoscapeInstance?: any;
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

function summarizeLongTasks(win: PerfWindow): LongTaskSummary {
  const longTasks = win.__mtPerfLongTasks || [];
  return {
    count: longTasks.length,
    maxDurationMs: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
    totalDurationMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
  };
}

export function collectPerformanceCounts(win: PerfWindow): PerformanceCounts {
  const session = win.commonService?.session || {};
  const data = session.data || {};
  const nodes = data.nodes || [];
  const links = data.links || [];
  const clusters = data.clusters || [];

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
): Cypress.Chainable<PerformanceMeasurement> {
  const profile = asJourneyProfile(scenario);
  const marks = {} as TimingMarks;
  let initialHeap: number | null = null;

  visitAppAndAcceptEula();
  startPerformanceCapture();

  cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    marks.uploadStart = perfWindow.performance.now();
    initialHeap = readHeapUsed(perfWindow);
  });

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

  ensureTwoDNetworkView();

  return cy.window().then((win: unknown) => {
    marks.viewReady = (win as Window).performance.now();
    const measurement = buildMeasurement(scenario, marks, initialHeap, win as PerfWindow);
    assertScenarioExpectedCounts(scenario, measurement.counts);
    return measurement;
  });
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
): Cypress.Chainable<PerformanceMeasurement> {
  return cy.window().then((win: unknown) => {
    const perfWindow = win as PerfWindow;
    const finalHeap = readHeapUsed(perfWindow);

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
        performance: getAppPerformance(perfWindow),
        patristic: getPatristicPerformance(perfWindow),
      },
    };
  });
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
      },
      metrics: measurement.metrics,
      counts: measurement.counts,
      heap: measurement.heap,
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
