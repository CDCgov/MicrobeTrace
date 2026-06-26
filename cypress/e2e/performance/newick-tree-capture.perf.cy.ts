/// <reference types="cypress" />

import {
  goToPhyloTreeView,
} from '../../support/journey-helpers';
import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  type PerformanceFileLoadSpec,
  type PerformanceScenario,
} from '../../support/perf-helpers';

type TreeCaptureScenario = {
  id: string;
  title: string;
  files: PerformanceFileLoadSpec[];
  referenceNewickFixture: string;
  metric: 'tn93' | 'snps';
  threshold: number;
  expectedNodes: number;
  expectedSequences?: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
};

type TreeCapture = {
  runId: string;
  ref: string;
  scenarioId: string;
  title: string;
  files: string[];
  referenceNewickFixture: string;
  metric: 'tn93' | 'snps';
  threshold: number;
  generatedNewick: string;
  generatedLeafIds: string[];
  counts: {
    sessionNodes: number;
    generatedLeaves: number;
  };
  metadata?: Record<string, unknown>;
  capturedAt: string;
};

const describeTreeValidation = Cypress.env('treeValidationMode') ? describe : describe.skip;
const treeRunId = String(
  Cypress.env('treeValidationRunId') ||
  Cypress.env('parityRunId') ||
  `newick-tree-${Date.now()}`,
);
const treeRef = String(Cypress.env('treeValidationRef') || 'current');
const scenarioFilter = String(Cypress.env('treeValidationScenario') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const scenarios: TreeCaptureScenario[] = [
  {
    id: 'angulartesting-fasta-vs-reference-newick',
    title: 'AngularTesting FASTA-derived MT tree compared with TN93 reference Newick',
    files: [
      {
        name: 'AngularTesting_seqs_TN93_BS.fasta',
        datatype: 'fasta',
      },
    ],
    referenceNewickFixture: 'AngularTesting_seqs_TN93_BS.nwk',
    metric: 'tn93',
    threshold: 0.015,
    expectedNodes: 14,
    expectedSequences: 14,
    timeoutMs: 180000,
    metadata: {
      fixtureKind: 'small-regression',
      comparisonMode: 'report-only-tree-reconstruction',
      distancePath: 'fasta-tn93',
    },
  },
  {
    id: 'pathogen-musse-500-fasta-vs-reference-newick',
    title: 'Bio-realistic MuSSE FASTA-derived MT tree compared with simulator reference Newick',
    files: [
      {
        name: 'performance/realistic/pathogen-musse-500-nodes.csv',
        datatype: 'node',
        field1: '_id',
        field2: 'seq_id',
      },
      {
        name: 'performance/realistic/pathogen-musse-500.fasta',
        datatype: 'fasta',
      },
    ],
    referenceNewickFixture: 'performance/realistic/pathogen-musse-500.nwk',
    metric: 'snps',
    threshold: 16,
    expectedNodes: 500,
    expectedSequences: 500,
    timeoutMs: 300000,
    metadata: {
      fixtureKind: 'bio-realistic-simulated',
      comparisonMode: 'report-only-tree-reconstruction',
      generator: 'scripts/generate-realistic-performance-fixtures.js',
      distancePath: 'alisim-fasta-snp',
    },
  },
];

function buildPerformanceScenario(scenario: TreeCaptureScenario): PerformanceScenario {
  return {
    id: scenario.id,
    title: scenario.title,
    files: scenario.files,
    preLaunch: {
      metric: scenario.metric,
      threshold: scenario.threshold,
      defaultView: '2D Network',
    },
    expected: {
      nodes: scenario.expectedNodes,
      sequences: scenario.expectedSequences,
    },
    metadata: scenario.metadata,
  };
}

function collectTreeCapture(scenario: TreeCaptureScenario): Cypress.Chainable<TreeCapture> {
  return cy.window({ timeout: scenario.timeoutMs }).then((win: any) => {
    const tree = win.commonService?.visuals?.phylogenetic?.tree;
    const treeData = tree?.data;
    const generatedNewick = String(treeData?.toNewick?.(false) || '').trim();
    const generatedLeaves = treeData?.getLeaves?.() || [];
    const generatedLeafIds = generatedLeaves
      .map((leaf: any) => String(leaf.id || leaf.name || '').trim())
      .filter(Boolean)
      .sort();

    expect(generatedNewick, `${scenario.id} generated Newick`).to.not.equal('');
    expect(generatedLeafIds.length, `${scenario.id} generated leaf count`).to.equal(scenario.expectedNodes);

    return {
      runId: treeRunId,
      ref: treeRef,
      scenarioId: scenario.id,
      title: scenario.title,
      files: scenario.files.map((file) => file.name),
      referenceNewickFixture: scenario.referenceNewickFixture,
      metric: scenario.metric,
      threshold: scenario.threshold,
      generatedNewick,
      generatedLeafIds,
      counts: {
        sessionNodes: (win.commonService.session.data.nodes || []).length,
        generatedLeaves: generatedLeafIds.length,
      },
      metadata: scenario.metadata,
      capturedAt: new Date().toISOString(),
    };
  });
}

function writeTreeCapture(capture: TreeCapture): Cypress.Chainable<{ filePath: string; runId: string }> {
  return cy.task(
    'newickValidation:writeArtifact',
    {
      runId: treeRunId,
      ref: treeRef,
      kind: 'tree-capture',
      scenarioId: capture.scenarioId,
      data: capture,
    },
    { log: false },
  ) as Cypress.Chainable<{ filePath: string; runId: string }>;
}

describeTreeValidation('Newick validation - full-data MT tree capture', () => {
  const selectedScenarios = scenarioFilter.length
    ? scenarios.filter((scenario) => scenarioFilter.includes(scenario.id))
    : scenarios;

  selectedScenarios.forEach((scenario) => {
    it(`captures MT-generated Newick for ${scenario.id}`, () => {
      const performanceScenario = buildPerformanceScenario(scenario);

      launchPerformanceScenarioToTwoD(performanceScenario, scenario.timeoutMs)
        .then((measurement) => appendMeasuredView(
          measurement,
          'phylogeneticTree',
          () => goToPhyloTreeView(scenario.timeoutMs),
        ))
        .then(() => collectTreeCapture(scenario))
        .then((capture) => writeTreeCapture(capture));
    });
  });
});
