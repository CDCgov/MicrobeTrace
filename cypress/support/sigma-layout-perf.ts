import {
  collectPerformanceCounts, getAppPerformance, getPatristicPerformance,
  startPerformanceCapture, type PerfWindow, type PerformanceMeasurement, type PerformanceScenario,
} from './perf-helpers';
import { visitAppAndAcceptEula } from './journey-helpers';

type Render = { threshold: number; durationMs: number; endedAt: number };
type EdgeLookup = { threshold: number; startedAt: number; durationMs: number };
type Probe = { startedAt: number; renders: Render[]; lookups: EdgeLookup[]; mergeAwareAvailable: boolean };
type LayoutWindow = PerfWindow & { __sigmaLayoutPerf: Probe };

export function installSigmaLayoutProbe(win: PerfWindow): void {
  const common = win.commonService;
  const probe: Probe = { startedAt: win.performance.now(), renders: [], lookups: [], mergeAwareAvailable: typeof common.getClusterMergeLayoutEdges === 'function' };
  (win as LayoutWindow).__sigmaLayoutPerf = probe;
  const record = common.recordPerformanceDuration;
  common.recordPerformanceDuration = function(category: string, name: string, duration: number, ...args: any[]) {
    const result = record.call(this, category, name, duration, ...args);
    if (category === 'render' && name === 'twoDSigmaRender') {
      probe.renders.push({ threshold: Number(this.session.style.widgets['link-threshold']), durationMs: duration, endedAt: win.performance.now() });
    }
    return result;
  };
  // This method is absent on the baseline commit. The same test measures both versions.
  if (probe.mergeAwareAvailable) {
    const lookup = common.getClusterMergeLayoutEdges;
    common.getClusterMergeLayoutEdges = async function(...args: any[]) {
      const startedAt = win.performance.now();
      const threshold = Number(this.session.style.widgets['link-threshold']);
      try { return await lookup.apply(this, args); }
      finally { probe.lookups.push({ threshold, startedAt, durationMs: win.performance.now() - startedAt }); }
    };
  }
}

function heap(win: Window): number | null {
  return (win.performance as any).memory?.usedJSHeapSize ?? null;
}

function assertReady(win: LayoutWindow, scenario: PerformanceScenario): void {
  const common = win.commonService;
  const twoD = common.visuals.twoD;
  const graph = twoD?.sigmaRenderer?.getGraph();
  expect(twoD?.sigmaActive, 'Sigma active; no compatibility fallback').to.equal(true);
  expect(twoD?.isRendererReady(), 'renderer ready').to.equal(true);
  expect(twoD.sigmaLoading || twoD.sigmaRendering, 'layout finished').to.equal(false);
  expect(Number(common.session.style.widgets['link-threshold']), 'applied threshold').to.equal(scenario.preLaunch.threshold);
  expect(twoD.getNetworkLayout(), 'force-directed layout').to.equal('force-directed');
  expect(graph.order, 'resident nodes').to.equal(scenario.expected.nodes);
  expect(graph.size, 'complete visible links, before drawing reduction').to.equal(scenario.expected.visibleLinks);
  expect(graph.size, 'visible-link guardrail').to.be.at.most(100000);
  expect(collectPerformanceCounts(win).visibleLinks, 'analytical visible links').to.equal(scenario.expected.visibleLinks);
  const blocked = (common.session.warnings || []).some((warning: any) =>
    warning.type === 'newick-visible-link-guardrail' && warning.hardLimitHit
    && Number(warning.threshold) === scenario.preLaunch.threshold);
  expect(blocked, 'no guardrail fallback accepted as a timing result').to.equal(false);
  const summary = twoD.sigmaClusterLayoutSummary;
  if (win.__sigmaLayoutPerf.mergeAwareAvailable) expect(summary, 'cluster layout diagnostics available').to.be.an('object');
  if (win.__sigmaLayoutPerf.mergeAwareAvailable && summary?.clusters > 1) {
    expect(summary.applied, 'cluster layout applied').to.equal(true);
    expect(summary.mergeLinks, 'genetic merge backbone used').to.be.greaterThan(0);
  }
}

function enrich(win: LayoutWindow, measurement: PerformanceMeasurement, since = 0): PerformanceMeasurement {
  const probe = win.__sigmaLayoutPerf;
  const captureStart = since || probe.startedAt;
  const captureEnd = win.performance.now();
  const tasks = (win.__mtPerfLongTasks || [])
    .filter(task => task.startTime < captureEnd && task.startTime + task.duration > captureStart)
    .map(task => Math.min(captureEnd, task.startTime + task.duration) - Math.max(captureStart, task.startTime));
  measurement.longTasks = { count: tasks.length, maxDurationMs: Math.max(0, ...tasks),
    totalDurationMs: tasks.reduce((sum, duration) => sum + duration, 0) };
  const renders = probe.renders.filter(render => render.endedAt >= since);
  const lookups = probe.lookups.filter(lookup => lookup.startedAt >= since);
  const summary = win.commonService.visuals.twoD.sigmaClusterLayoutSummary;
  if (probe.mergeAwareAvailable) expect(lookups.length, 'genetic layout lookup executed for this operation').to.be.greaterThan(0);
  Object.assign(measurement.metrics, {
    sigmaRenderMs: renders.reduce((sum, render) => sum + render.durationMs, 0),
    sigmaRenderCount: renders.length,
    mergeEdgeLookupMs: lookups.reduce((sum, lookup) => sum + lookup.durationMs, 0),
    mergeEdgeLookupCount: lookups.length,
    mergeAwareAvailable: probe.mergeAwareAvailable ? 1 : 0,
    layoutClusters: summary?.clusters ?? null,
    layoutMergeLinks: summary?.mergeLinks ?? null,
  });
  // Snapshot now: subsequent threshold steps mutate the session timing objects.
  measurement.app.performance = JSON.parse(JSON.stringify(getAppPerformance(win) || {}));
  measurement.app.patristic = JSON.parse(JSON.stringify(getPatristicPerformance(win) || {}));
  return measurement;
}

export function finishSigmaLayoutLoad(scenario: PerformanceScenario, measurement: PerformanceMeasurement, timeout: number): Cypress.Chainable<PerformanceMeasurement> {
  return cy.window({ timeout }).should((win: any) => {
    assertReady(win, scenario);
    const probe: Probe = win.__sigmaLayoutPerf;
    expect(probe.renders.length, 'completed initial render').to.be.greaterThan(0);
    expect(probe.renders.every(render => render.threshold === scenario.preLaunch.threshold), 'first render started at requested threshold').to.equal(true);
    expect(probe.lookups.every(lookup => lookup.threshold === scenario.preLaunch.threshold), 'first genetic layout used requested threshold').to.equal(true);
  }).then(win => enrich(win as unknown as LayoutWindow, measurement));
}

export function launchSigmaSession(scenario: PerformanceScenario, timeout: number): Cypress.Chainable<PerformanceMeasurement> {
  return cy.task<string>('perf:prepareSigmaLayoutSession', { threshold: scenario.preLaunch.threshold }, { timeout, log: false }).then(filePath => {
    let nextstrainRequests = 0;
    cy.intercept({ hostname: /(^|\.)nextstrain\.org$/ }, request => {
      nextstrainRequests++;
      request.destroy();
    });
    visitAppAndAcceptEula({ extraQuery: { renderer: 'sigma' } });
    startPerformanceCapture();
    let startedAt = 0;
    let initialHeap: number | null = null;
    cy.window().then(win => {
      installSigmaLayoutProbe(win as unknown as PerfWindow);
      startedAt = win.performance.now();
      initialHeap = heap(win);
    });
    cy.get('#fileDropRef').selectFile(filePath, { force: true, log: false });
    return cy.window({ timeout }).should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded, 'session fully loaded').to.equal(true);
      assertReady(win, scenario);
    }).then(win => {
      const layoutWindow = win as unknown as LayoutWindow;
      expect(nextstrainRequests, 'saved session works without Nextstrain network requests').to.equal(0);
      const tasks = layoutWindow.__mtPerfLongTasks || [];
      const finalHeap = heap(win);
      const measurement: PerformanceMeasurement = {
        scenarioId: scenario.id, startedAt: new Date().toISOString(),
        metrics: { totalMeasuredMs: win.performance.now() - startedAt },
        counts: collectPerformanceCounts(layoutWindow),
        heap: { initialUsedJSHeapSize: initialHeap, finalUsedJSHeapSize: finalHeap,
          deltaUsedJSHeapSize: initialHeap !== null && finalHeap !== null ? finalHeap - initialHeap : null },
        longTasks: { count: tasks.length, maxDurationMs: Math.max(0, ...tasks.map(task => task.duration)),
          totalDurationMs: tasks.reduce((sum, task) => sum + task.duration, 0) },
        app: { loadTimeMs: null },
      };
      return finishSigmaLayoutLoad(scenario, measurement, timeout);
    });
  });
}

export function measureSigmaLayoutAction(scenario: PerformanceScenario, action: 'threshold' | 'recalculate', timeout: number): Cypress.Chainable<PerformanceMeasurement> {
  return cy.window({ timeout }).then({ timeout }, async window => {
    const win = window as unknown as LayoutWindow;
    const twoD = win.commonService.visuals.twoD;
    const initialHeap = heap(win);
    const previousRenders = win.__sigmaLayoutPerf.renders.length;
    const startedAt = win.performance.now();
    let lastFrame = startedAt, maxFrameGapMs = 0, frameCount = 0, active = true;
    const frame = (now: number) => {
      if (!active) return;
      maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame);
      lastFrame = now; frameCount++;
      win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
    try {
      // Same handlers used by committed threshold changes and Recalculate Layout.
      if (action === 'threshold') await win.commonService.applyLinkThreshold(scenario.preLaunch.threshold);
      else await twoD.updateLayout();
      let ready = false;
      while (!ready) {
        if (win.performance.now() - startedAt > timeout) throw new Error(`Timed out waiting for ${scenario.id}`);
        const current = win.commonService.visuals.twoD;
        const graph = current?.sigmaRenderer?.getGraph();
        ready = win.__sigmaLayoutPerf.renders.length > previousRenders
          && current?.sigmaActive === true && current?.isRendererReady()
          && current.sigmaLoading === false && current.sigmaRendering === false
          && Number(win.commonService.session.style.widgets['link-threshold']) === scenario.preLaunch.threshold
          && graph?.order === scenario.expected.nodes && graph?.size === scenario.expected.visibleLinks;
        if (!ready) await new Promise(resolve => win.setTimeout(resolve, 25));
      }
      // Include presentation, rather than stopping at the synchronous handler return.
      await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
      assertReady(win, scenario);
      const endedAt = win.performance.now();
      await new Promise(resolve => win.setTimeout(resolve, 0));
      const tasks = (win.__mtPerfLongTasks || []).filter(task => task.startTime >= startedAt && task.startTime <= endedAt);
      const finalHeap = heap(win);
      return enrich(win, {
        scenarioId: scenario.id, startedAt: new Date().toISOString(),
        metrics: { totalMeasuredMs: endedAt - startedAt, actionToReadyMs: endedAt - startedAt, maxFrameGapMs, frameCount },
        counts: collectPerformanceCounts(win),
        heap: { initialUsedJSHeapSize: initialHeap, finalUsedJSHeapSize: finalHeap,
          deltaUsedJSHeapSize: initialHeap !== null && finalHeap !== null ? finalHeap - initialHeap : null },
        longTasks: { count: tasks.length, maxDurationMs: Math.max(0, ...tasks.map(task => task.duration)),
          totalDurationMs: tasks.reduce((sum, task) => sum + task.duration, 0) },
        app: { loadTimeMs: null },
      }, startedAt);
    } finally { active = false; }
  });
}
