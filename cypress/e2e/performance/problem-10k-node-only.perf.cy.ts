/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureFrameGaps,
  writePerformanceResult,
  type PerformanceScenario,
  type PerfWindow,
} from '../../support/perf-helpers';
import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

const describeProblem10kPerf = Cypress.env('perfMode') && Cypress.env('perfProblem10k')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'problem-10k-node-only',
  title: 'Problem 10k uploaded node CSV: no links',
  files: [
    {
      name: 'performance/problem_10k.csv',
      datatype: 'node',
      field1: 'Sample Identifier',
      field2: 'None',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 10253,
    totalLinks: 0,
    visibleLinks: 0,
  },
  metadata: {
    fixtureKind: 'uploaded-node-only',
    tier: 'problem',
    interactions: [
      'pan',
      'zoom',
      'box-select',
      'enable-groups-default-cluster',
      'group-by-hhs-region-site',
      'post-group-pan',
      'post-group-zoom',
      'post-group-box-select',
    ],
  },
};

const milestonePath = 'cypress/downloads/performance/problem-10k-milestone.json';

function writeMilestone(stage: string): Cypress.Chainable<null> {
  return cy.writeFile(milestonePath, {
    stage,
    at: new Date().toISOString(),
  });
}

function mergeMetrics(measurement: any, metrics: Record<string, number | null>) {
  Object.assign(measurement.metrics, metrics);
  return measurement;
}

function measureAsyncFrameGaps(
  metricPrefix: string,
  action: (win: PerfWindow) => unknown | Promise<unknown>,
  settleMs = 1000,
): Cypress.Chainable<Record<string, number | null>> {
  return cy.window().then({ timeout: 120000 }, (win: unknown) => {
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

      const finish = () => {
        perfWindow.setTimeout(() => {
          active = false;
          const end = perfWindow.performance.now();
          const maxGap = gaps.reduce((max, gap) => Math.max(max, gap), 0);
          const totalGap = gaps.reduce((sum, gap) => sum + gap, 0);
          const sorted = gaps.slice().sort((a, b) => a - b);
          const p95Index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);

          resolve({
            [`${metricPrefix}ActionMs`]: actionDurationMs,
            [`${metricPrefix}FrameCount`]: gaps.length,
            [`${metricPrefix}MaxFrameGapMs`]: gaps.length ? maxGap : null,
            [`${metricPrefix}P95FrameGapMs`]: sorted.length ? sorted[p95Index] : null,
            [`${metricPrefix}AverageFrameGapMs`]: gaps.length ? totalGap / gaps.length : null,
            [`${metricPrefix}ObservedMs`]: end - start,
          });
        }, settleMs);
      };

      try {
        perfWindow.requestAnimationFrame(tick);
        const actionStart = perfWindow.performance.now();
        Cypress.Promise.resolve(action(perfWindow))
          .then(() => {
            actionDurationMs = perfWindow.performance.now() - actionStart;
            finish();
          })
          .catch((error) => {
            active = false;
            reject(error);
          });
      } catch (error) {
        active = false;
        reject(error);
      }
    });
  });
}

function getUngroupedVisibleNode(win: PerfWindow): any {
  const cyInstance = win.cytoscapeInstance;
  if (!cyInstance) throw new Error('Cytoscape instance is not available');

  const node = cyInstance.nodes(':visible').filter((candidate: any) => (
    !candidate.hasClass('parent') && candidate.children().length === 0
  ))[0];
  if (!node) throw new Error('No visible ungrouped node is available');

  return node;
}

describeProblem10kPerf('Performance Baseline - problem 10k node-only graph', () => {
  it('records load, grouping, and post-group interaction metrics', () => {
    if (Cypress.env('perfProblem10kMilestones')) {
      const profile = {
        id: scenario.id,
        title: scenario.title,
        tags: ['performance'],
        files: scenario.files,
        preLaunch: {
          ...scenario.preLaunch,
          defaultView: Cypress.env('perfProblem10kTableView') ? 'Table' : scenario.preLaunch.defaultView,
        },
        expectations: {},
      };

      writeMilestone('start');
      visitAppAndAcceptEula();
      writeMilestone('visited');
      cy.loadFiles(scenario.files);
      writeMilestone('files-loaded');
      applyPreLaunchFileSettings(profile);
      ensurePreLaunchProfileSynced(profile);
      writeMilestone('prelaunch-synced');
      cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
      cy.get('#launch').click({ force: true });
      writeMilestone('launch-clicked');
      cy.get('#loading-information', { timeout: 600000 }).should('not.exist');
      writeMilestone('loading-overlay-closed');
      cy.window({ timeout: 600000 })
        .its('commonService.session.network.isFullyLoaded')
        .should('equal', true);
      writeMilestone('processing-complete');
      ensureTwoDNetworkView();
      writeMilestone('twod-ready');
      return;
    }

    const launched = launchPerformanceScenarioToTwoD(scenario, 600000);

    if (Cypress.env('perfProblem10kLoadOnly')) {
      launched.then((measurement) => writePerformanceResult(scenario, measurement));
      return;
    }

    launched
      .then((measurement) => measureFrameGaps('pan', (win) => {
        win.cytoscapeInstance.panBy({ x: 120, y: -80 });
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureFrameGaps('zoom', (win) => {
        const cyInstance = win.cytoscapeInstance;
        cyInstance.zoom({
          level: cyInstance.zoom() * 0.85,
          renderedPosition: { x: 400, y: 300 },
        });
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureFrameGaps('boxSelect', (win) => {
        const node = getUngroupedVisibleNode(win);
        const position = node.renderedPosition();
        (win as any).Cypress.test.selectNodesInRenderedBox(
          position.x - 24,
          position.y - 24,
          position.x + 24,
          position.y + 24,
        );
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureAsyncFrameGaps('enableGroupsDefaultCluster', (win) => {
        win.commonService.visuals.twoD.polygonsToggle(true);
      }, 1000).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureAsyncFrameGaps('groupByHhsRegionSite', (win) => (
        win.commonService.visuals.twoD.centerPolygons('HHS region and Site')
      ), 1500).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureFrameGaps('postGroupPan', (win) => {
        win.cytoscapeInstance.panBy({ x: -90, y: 70 });
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureFrameGaps('postGroupZoom', (win) => {
        const cyInstance = win.cytoscapeInstance;
        cyInstance.zoom({
          level: cyInstance.zoom() * 1.1,
          renderedPosition: { x: 400, y: 300 },
        });
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => measureFrameGaps('postGroupBoxSelect', (win) => {
        const node = getUngroupedVisibleNode(win);
        const position = node.renderedPosition();
        (win as any).Cypress.test.selectNodesInRenderedBox(
          position.x - 24,
          position.y - 24,
          position.x + 24,
          position.y + 24,
        );
      }, 750).then((metrics) => mergeMetrics(measurement, metrics)))
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
