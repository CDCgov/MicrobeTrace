/// <reference types="cypress" />

import {
  assertMetricCount,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../support/journey-helpers';
import {
  launchPerformanceScenarioToTwoD,
  type PerformanceFileLoadSpec,
  type PerformanceScenario,
} from '../../support/perf-helpers';

type ThresholdCapture = {
  threshold: number;
  expectedVisibleLinks: number;
};

type EdgeParityScenario = {
  id: string;
  title: string;
  files: PerformanceFileLoadSpec[];
  metric: 'tn93' | 'snps';
  timeoutMs: number;
  expectedNodes: number;
  thresholds: ThresholdCapture[];
  metadata?: Record<string, unknown>;
};

type VisibleEdgeSnapshot = {
  runId: string;
  ref: string;
  scenarioId: string;
  sourceScenarioId: string;
  title: string;
  files: string[];
  metric: 'tn93' | 'snps';
  threshold: number;
  widgetThreshold: number | null;
  nodeIds: string[];
  visibleEdges: Array<{
    source: string;
    target: string;
    distance: number | null;
    id: string;
  }>;
  counts: {
    visibleNodes: number;
    visibleEdges: number;
    sessionNodes: number;
    sessionLinks: number;
    sessionVisibleLinks: number;
  };
  metadata?: Record<string, unknown>;
  capturedAt: string;
};

const describeParity = Cypress.env('parityMode') ? describe : describe.skip;
const parityRunId = String(Cypress.env('parityRunId') || `newick-parity-${Date.now()}`);
const parityRef = String(Cypress.env('parityRef') || 'current');
const includeStress = Boolean(Cypress.env('parityStress'));
const scenarioFilter = String(Cypress.env('parityScenario') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const scenarios: EdgeParityScenario[] = [
  {
    id: 'angulartesting-tn93-newick',
    title: 'AngularTesting TN93 Newick',
    files: [
      {
        name: 'AngularTesting_seqs_TN93_BS.nwk',
        datatype: 'newick',
      },
    ],
    metric: 'tn93',
    timeoutMs: 120000,
    expectedNodes: 14,
    thresholds: [
      { threshold: 0.015, expectedVisibleLinks: 14 },
      { threshold: 0.02, expectedVisibleLinks: 45 },
      { threshold: 0.001, expectedVisibleLinks: 2 },
    ],
    metadata: {
      fixtureKind: 'small-regression',
      distancePath: 'newick-patristic',
    },
  },
  {
    id: 'average-newick-500',
    title: 'Average generated Newick',
    files: [
      {
        name: 'performance/average-newick-500.nwk',
        datatype: 'newick',
      },
    ],
    metric: 'tn93',
    timeoutMs: 240000,
    expectedNodes: 500,
    thresholds: [
      { threshold: 0.003, expectedVisibleLinks: 3000 },
      { threshold: 0.006, expectedVisibleLinks: 12250 },
    ],
    metadata: {
      fixtureKind: 'deterministic-generated',
      distancePath: 'generated-newick-patristic',
      generator: 'scripts/generate-performance-fixtures.js',
    },
  },
  {
    id: 'large-newick-1000',
    title: 'Large generated Newick',
    files: [
      {
        name: 'performance/large-newick-1000.nwk',
        datatype: 'newick',
      },
    ],
    metric: 'tn93',
    timeoutMs: 420000,
    expectedNodes: 1000,
    thresholds: [
      { threshold: 0.003, expectedVisibleLinks: 6000 },
    ],
    metadata: {
      fixtureKind: 'deterministic-generated',
      tier: 'large',
      distancePath: 'generated-newick-patristic',
      generator: 'scripts/generate-performance-fixtures.js',
    },
  },
];

const stressScenario: EdgeParityScenario = {
  id: 'stress-newick-2000',
  title: 'Stress generated Newick',
  files: [
    {
      name: 'performance/stress-newick-2000.nwk',
      datatype: 'newick',
    },
  ],
  metric: 'tn93',
  timeoutMs: 900000,
  expectedNodes: 2000,
  thresholds: [
    { threshold: 0.003, expectedVisibleLinks: 12000 },
    { threshold: 0.006, expectedVisibleLinks: 49000 },
  ],
  metadata: {
    fixtureKind: 'deterministic-generated',
    tier: 'stress',
    distancePath: 'generated-newick-patristic',
    generator: 'scripts/generate-performance-fixtures.js',
  },
};

function snapshotScenarioId(scenarioId: string, threshold: number): string {
  return `${scenarioId}-threshold-${String(threshold).replace(/\./g, 'p')}`;
}

function buildPerformanceScenario(scenario: EdgeParityScenario): PerformanceScenario {
  const initialThreshold = scenario.thresholds[0];

  return {
    id: scenario.id,
    title: scenario.title,
    files: scenario.files,
    preLaunch: {
      metric: scenario.metric,
      threshold: initialThreshold.threshold,
      defaultView: '2D Network',
    },
    expected: {
      nodes: scenario.expectedNodes,
      visibleLinks: initialThreshold.expectedVisibleLinks,
    },
    metadata: scenario.metadata,
  };
}

function setThresholdIfNeeded(threshold: number, isInitialThreshold: boolean, timeoutMs: number): void {
  if (isInitialThreshold) return;

  openGlobalFilteringTab();
  setGlobalLinkThreshold(threshold);
  cy.closeGlobalSettings();
  waitForProcessingDialogToClear(timeoutMs);
}

function collectVisibleEdgeSnapshot(
  scenario: EdgeParityScenario,
  threshold: ThresholdCapture,
): Cypress.Chainable<VisibleEdgeSnapshot> {
  const scenarioId = snapshotScenarioId(scenario.id, threshold.threshold);

  return cy.window({ timeout: scenario.timeoutMs }).then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const visibleNodes = cyInstance
      .nodes(':visible')
      .filter((node: any) => node.children().length === 0 && !node.hasClass('parent'));
    const nodeIds = visibleNodes
      .map((node: any) => String(node.id()))
      .sort();
    const visibleEdges = cyInstance
      .edges(':visible')
      .map((edge: any) => {
        const source = String(edge.source().id());
        const target = String(edge.target().id());
        const ordered = [source, target].sort();
        const rawDistance = Number(edge.data('distance'));

        return {
          source: ordered[0],
          target: ordered[1],
          distance: Number.isFinite(rawDistance) ? rawDistance : null,
          id: String(edge.id()),
        };
      })
      .sort((left: any, right: any) => (
        left.source.localeCompare(right.source) ||
        left.target.localeCompare(right.target) ||
        left.id.localeCompare(right.id)
      ));
    const sessionLinks = win.commonService.session.data.links || [];
    const widgetThreshold = Number(win.commonService.session.style.widgets['link-threshold']);

    return {
      runId: parityRunId,
      ref: parityRef,
      scenarioId,
      sourceScenarioId: scenario.id,
      title: scenario.title,
      files: scenario.files.map((file) => file.name),
      metric: scenario.metric,
      threshold: threshold.threshold,
      widgetThreshold: Number.isFinite(widgetThreshold) ? widgetThreshold : null,
      nodeIds,
      visibleEdges,
      counts: {
        visibleNodes: nodeIds.length,
        visibleEdges: visibleEdges.length,
        sessionNodes: (win.commonService.session.data.nodes || []).length,
        sessionLinks: sessionLinks.length,
        sessionVisibleLinks: sessionLinks.filter((link: any) => link.visible === true).length,
      },
      metadata: scenario.metadata,
      capturedAt: new Date().toISOString(),
    };
  });
}

function writeSnapshot(snapshot: VisibleEdgeSnapshot): Cypress.Chainable<{ filePath: string; runId: string }> {
  return cy.task(
    'newickValidation:writeArtifact',
    {
      runId: parityRunId,
      ref: parityRef,
      kind: 'edge-snapshot',
      scenarioId: snapshot.scenarioId,
      data: snapshot,
    },
    { log: false },
  ) as Cypress.Chainable<{ filePath: string; runId: string }>;
}

describeParity('Newick validation - 2D visible edge parity capture', () => {
  const allScenarios = includeStress ? [...scenarios, stressScenario] : scenarios;
  const selectedScenarios = scenarioFilter.length
    ? allScenarios.filter((scenario) => scenarioFilter.includes(scenario.id))
    : allScenarios;

  selectedScenarios.forEach((scenario) => {
    it(`captures visible 2D Newick edge snapshots for ${scenario.id}`, () => {
      const performanceScenario = buildPerformanceScenario(scenario);

      launchPerformanceScenarioToTwoD(performanceScenario, scenario.timeoutMs);

      scenario.thresholds.forEach((threshold, index) => {
        setThresholdIfNeeded(threshold.threshold, index === 0, scenario.timeoutMs);
        assertMetricCount('#numberOfVisibleLinks', threshold.expectedVisibleLinks, scenario.timeoutMs);

        collectVisibleEdgeSnapshot(scenario, threshold).then((snapshot) => {
          expect(snapshot.counts.visibleEdges, `${snapshot.scenarioId} Cytoscape visible edge count`)
            .to.equal(threshold.expectedVisibleLinks);
          expect(snapshot.counts.visibleNodes, `${snapshot.scenarioId} visible node count`)
            .to.equal(scenario.expectedNodes);
          return writeSnapshot(snapshot);
        });
      });
    });
  });
});
