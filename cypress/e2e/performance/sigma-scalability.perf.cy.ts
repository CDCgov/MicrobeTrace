/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  refreshPerformanceMeasurement,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeSigmaPerf = Cypress.env('perfMode') && Cypress.env('perfSigma')
  ? describe
  : describe.skip;

const scenarios: Array<{ scenario: PerformanceScenario; timeout: number }> = [
  {
    scenario: {
      id: 'sigma-average-graph-1600n-3200l',
      title: 'Sigma average generated graph: 1600 nodes and 3200 links',
      files: [
        { name: 'performance/average-graph-nodes.csv', datatype: 'node', field1: '_id' },
        {
          name: 'performance/average-graph-links.csv',
          datatype: 'link',
          field1: 'source',
          field2: 'target',
          field3: 'distance',
        },
      ],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' },
      expected: { nodes: 1600, totalLinks: 3200, visibleLinks: 3200 },
      metadata: { renderer: 'sigma', tier: 'average', fixtureKind: 'deterministic-generated' },
    },
    timeout: 180000,
  },
  {
    scenario: {
      id: 'sigma-large-graph-5000n-10000l',
      title: 'Sigma large generated graph: 5000 nodes and 10000 links',
      files: [
        { name: 'performance/large-graph-nodes.csv', datatype: 'node', field1: '_id' },
        {
          name: 'performance/large-graph-links.csv',
          datatype: 'link',
          field1: 'source',
          field2: 'target',
          field3: 'distance',
        },
      ],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' },
      expected: { nodes: 5000, totalLinks: 10000, visibleLinks: 10000 },
      metadata: { renderer: 'sigma', tier: 'large', fixtureKind: 'deterministic-generated' },
    },
    timeout: 300000,
  },
  {
    scenario: {
      id: 'sigma-stress-graph-10000n-25000l',
      title: 'Sigma stress generated graph: 10000 nodes and 25000 links',
      files: [
        { name: 'performance/stress-graph-nodes.csv', datatype: 'node', field1: '_id' },
        {
          name: 'performance/stress-graph-links.csv',
          datatype: 'link',
          field1: 'source',
          field2: 'target',
          field3: 'distance',
        },
      ],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' },
      expected: { nodes: 10000, totalLinks: 25000, visibleLinks: 25000 },
      metadata: { renderer: 'sigma', tier: 'stress', fixtureKind: 'deterministic-generated' },
    },
    timeout: 600000,
  },
];

const assertSigmaMeasurement = (
  scenario: PerformanceScenario,
  measurement: PerformanceMeasurement,
): void => {
  expect(measurement.counts.activeRenderer, `${scenario.id} renderer`).to.equal('sigma');
  expect(measurement.counts.sigmaResidentNodes, `${scenario.id} resident nodes`)
    .to.equal(scenario.expected.nodes);
  expect(measurement.counts.sigmaResidentLinks, `${scenario.id} resident links`)
    .to.equal(scenario.expected.totalLinks);
  expect(measurement.counts.sigmaDrawnLinks, `${scenario.id} drawn links`)
    .to.be.greaterThan(0)
    .and.at.most(scenario.expected.totalLinks || 0);
  expect(measurement.counts.cytoscapeVisibleEdges, `${scenario.id} Cytoscape allocation`)
    .to.equal(null);
  expect(measurement.metrics.totalMeasuredMs, `${scenario.id} total measured time`)
    .to.be.a('number')
    .and.greaterThan(0);
};

const readHeapUsed = (win: Window): number | null => {
  const value = (win.performance as any)?.memory?.usedJSHeapSize;
  return typeof value === 'number' ? value : null;
};

const measureLargeGraphLifecycle = (
  measurement: PerformanceMeasurement,
  cycles = 3,
): Cypress.Chainable<PerformanceMeasurement> => {
  type LifecycleSnapshot = {
    activeHeapBytes: number | null;
    closedHeapBytes: number | null;
  };
  const lifecycleSnapshots: LifecycleSnapshot[] = [];
  let initialHeap: number | null = null;
  let finalHeap: number | null = null;
  let baselineCanvasCount = 0;
  let explicitGcAvailable = false;
  let retiredAdapterCount = 0;

  // Keep all lifecycle work inside one application-frame callback. Cypress
  // otherwise retains a DOM snapshot for every command, which makes the test
  // runner's own history look like application heap retention.
  cy.window({ timeout: 300000 }).then({ timeout: 300000 }, async win => {
    const app = (win as any).commonService.visuals.microbeTrace;
    const wait = (milliseconds: number) => new Promise<void>(resolve => win.setTimeout(resolve, milliseconds));
    const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 300000): Promise<void> => {
      const startedAt = win.performance.now();
      while (!predicate()) {
        if (win.performance.now() - startedAt > timeoutMs) {
          throw new Error(`Timed out waiting for ${label}`);
        }
        await wait(50);
      }
    };
    const collectGarbage = async (): Promise<void> => {
      const forceGc = (win as any).gc;
      explicitGcAvailable = typeof forceGc === 'function';
      if (!explicitGcAvailable) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        forceGc();
        await wait(100);
      }
    };
    const getTwoD = (): any => (win as any).commonService.visuals.twoD;
    const isSigmaReady = (): boolean => {
      const twoD = getTwoD();
      const summary = twoD?.sigmaSummary;
      return twoD?.sigmaActive === true
        && twoD?.sigmaLoading === false
        && summary?.residentNodeCount === 5000
        && summary?.residentLinkCount === 10000;
    };

    await collectGarbage();
    initialHeap = readHeapUsed(win);
    baselineCanvasCount = win.document
      .querySelectorAll('[data-testid="sigma-network"] canvas').length;
    expect(baselineCanvasCount, 'large-graph Sigma canvas layers').to.be.greaterThan(0);

    for (let cycle = 0; cycle < cycles; cycle++) {
      let twoD = getTwoD();
      let adapter = twoD.sigmaRenderer;
      expect(adapter.getGraph().order, `large lifecycle nodes before cycle ${cycle + 1}`)
        .to.equal(5000);
      expect(adapter.getGraph().size, `large lifecycle links before cycle ${cycle + 1}`)
        .to.equal(10000);

      app._goldenLayoutHostComponent.removeComponent('2D Network');
      await waitFor(
        () => !app.homepageTabs.some((tab: any) => tab.label === '2D Network') && getTwoD() == null,
        `large lifecycle close ${cycle + 1}`,
      );

      expect(adapter.getRenderer(), `large lifecycle renderer released in cycle ${cycle + 1}`)
        .to.equal(null);
      expect(adapter.hasActiveWebglContext(), `large lifecycle WebGL released in cycle ${cycle + 1}`)
        .to.equal(false);
      expect(adapter.getGraph().order, `large lifecycle resident nodes released in cycle ${cycle + 1}`)
        .to.equal(0);
      expect(adapter.getGraph().size, `large lifecycle resident links released in cycle ${cycle + 1}`)
        .to.equal(0);
      expect(adapter.getDisplayGraph().order, `large lifecycle display nodes released in cycle ${cycle + 1}`)
        .to.equal(0);
      expect(adapter.getDisplayGraph().size, `large lifecycle display links released in cycle ${cycle + 1}`)
        .to.equal(0);
      retiredAdapterCount++;
      adapter = null;
      twoD = null;
      await collectGarbage();
      const closedHeapBytes = readHeapUsed(win);

      app.Viewclick('2D Network');
      await waitFor(isSigmaReady, `large lifecycle reopen ${cycle + 1}`);
      await collectGarbage();
      const activeHeapBytes = readHeapUsed(win);
      const canvasCount = win.document
        .querySelectorAll('[data-testid="sigma-network"] canvas').length;
      expect(getTwoD().sigmaRenderer.hasActiveWebglContext()).to.equal(true);
      expect(canvasCount, `stable large-graph canvas layers in cycle ${cycle + 1}`)
        .to.equal(baselineCanvasCount);
      lifecycleSnapshots.push({ activeHeapBytes, closedHeapBytes });
    }

    finalHeap = readHeapUsed(win);
    if (explicitGcAvailable && initialHeap !== null && finalHeap !== null) {
      const heapGrowthBytes = finalHeap - initialHeap;
      expect(
        heapGrowthBytes,
        'three large-graph renderer recreations stay within the 64 MiB heap-growth budget',
      ).to.be.at.most(64 * 1024 * 1024);
    }
  });

  return refreshPerformanceMeasurement(measurement).then(refreshed => {
    Object.assign(refreshed.metrics, {
      sigmaLifecycleCycles: cycles,
      sigmaLifecycleInitialHeapBytes: initialHeap,
      sigmaLifecycleFinalHeapBytes: finalHeap,
      sigmaLifecycleHeapDeltaBytes:
        initialHeap !== null && finalHeap !== null ? finalHeap - initialHeap : null,
      sigmaLifecycleRetiredAdapterCount: retiredAdapterCount,
      sigmaLifecycleRetainedNodeCount: 0,
      sigmaLifecycleRetainedLinkCount: 0,
      sigmaLifecycleCanvasLayerCount: baselineCanvasCount,
      sigmaLifecycleExplicitGcAvailable: explicitGcAvailable ? 1 : 0,
      ...lifecycleSnapshots.reduce<Record<string, number | null>>((metrics, snapshot, index) => {
        metrics[`sigmaLifecycleCycle${index + 1}ClosedHeapBytes`] = snapshot.closedHeapBytes;
        metrics[`sigmaLifecycleCycle${index + 1}ActiveHeapBytes`] = snapshot.activeHeapBytes;
        return metrics;
      }, {}),
    });
    return refreshed;
  });
};

describeSigmaPerf('Performance - Sigma integrated scalability', () => {
  const requestedTier = String(Cypress.env('perfSigmaTier') || '').trim().toLowerCase();
  const enabledScenarios = requestedTier
    ? scenarios.filter(({ scenario }) => scenario.metadata?.tier === requestedTier)
    : scenarios;

  enabledScenarios.forEach(({ scenario, timeout }) => {
    it(`records ${scenario.metadata?.tier} graph load, renderer, heap, and long-task metrics`, () => {
      launchPerformanceScenarioToTwoD(scenario, timeout, { renderer: 'sigma' })
        .then(measurement => {
          assertSigmaMeasurement(scenario, measurement);
          return scenario.metadata?.tier === 'large'
            ? measureLargeGraphLifecycle(measurement)
            : measurement;
        })
        .then(measurement => writePerformanceResult(scenario, measurement));
    });
  });
});
