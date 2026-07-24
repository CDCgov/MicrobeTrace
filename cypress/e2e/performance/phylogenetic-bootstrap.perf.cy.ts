/// <reference types="cypress" />

import {
  collectPerformanceCounts,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import { goToPhyloTreeView } from '../../support/journey-helpers';

type SequenceLengthSummary = number | { min: number; max: number };

type BootstrapPerfScenario = PerformanceScenario & {
  timeoutMs: number;
  metadata: Record<string, unknown> & {
    sequenceCount: number;
    sequenceLength: SequenceLengthSummary;
    fixtureKind: string;
    tier?: string;
  };
};

type PerfWindow = Window & {
  commonService: any;
};

const describeBootstrapPerf = Cypress.env('perfMode') && Cypress.env('perfBootstrap')
  ? describe
  : describe.skip;

Cypress.config('retries', 0);

const scenarioFilter = String(Cypress.env('perfBootstrapScenario') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const replicateCounts = String(Cypress.env('perfBootstrapReplicates') || '100,1000')
  .split(',')
  .map((entry) => Number(entry.trim()))
  .filter((value) => Number.isFinite(value) && value > 0)
  .map((value) => Math.min(1000, Math.max(1, Math.round(value))));

const coreScenarios: BootstrapPerfScenario[] = [
  {
    id: 'bootstrap-average-clustered-sequences-120',
    title: 'Bootstrap performance: average generated FASTA, 120 aligned sequences',
    files: [
      {
        name: 'performance/average-sequences.fasta',
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 120,
      totalLinks: 7140,
      visibleLinks: 840,
      sequences: 120,
    },
    timeoutMs: 180000,
    metadata: {
      fixtureKind: 'deterministic-generated-clustered',
      generator: 'scripts/generate-performance-fixtures.js',
      clusterCount: 8,
      samplesPerCluster: 15,
      sequenceCount: 120,
      sequenceLength: 2400,
      snpThreshold: 16,
      distancePath: 'generated-fasta-snp',
    },
  },
  {
    id: 'bootstrap-large-clustered-sequences-300',
    title: 'Bootstrap performance: large generated FASTA, 300 aligned sequences',
    files: [
      {
        name: 'performance/large-sequences.fasta',
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 300,
      totalLinks: 44850,
      visibleLinks: 2850,
      sequences: 300,
    },
    timeoutMs: 300000,
    metadata: {
      fixtureKind: 'deterministic-generated-clustered',
      generator: 'scripts/generate-performance-fixtures.js',
      clusterCount: 15,
      samplesPerCluster: 20,
      sequenceCount: 300,
      sequenceLength: 1800,
      snpThreshold: 16,
      tier: 'large',
      distancePath: 'generated-fasta-snp',
    },
  },
  {
    id: 'bootstrap-realistic-pathogen-musse-500',
    title: 'Bootstrap performance: bio-realistic MuSSE FASTA, 500 aligned sequences',
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
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 500,
      totalLinks: 124750,
      visibleLinks: 47,
      sequences: 500,
    },
    timeoutMs: 300000,
    metadata: {
      fixtureKind: 'bio-realistic-simulated',
      generator: 'scripts/generate-realistic-performance-fixtures.js',
      preset: 'pathogen-musse-500',
      sequenceCount: 500,
      sequenceLength: { min: 9750, max: 9750 },
      snpThreshold: 16,
      distancePath: 'alisim-fasta-snp',
    },
  },
  {
    id: 'bootstrap-expanded-large-clustered-sequences-1000',
    title: 'Bootstrap performance: expanded large generated FASTA, 1000 aligned sequences',
    files: [
      {
        name: 'performance/expanded-large-sequences-1000.fasta',
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 1000,
      totalLinks: 499500,
      visibleLinks: 19500,
      sequences: 1000,
    },
    timeoutMs: 600000,
    metadata: {
      fixtureKind: 'deterministic-generated-clustered',
      generator: 'scripts/generate-performance-fixtures.js',
      clusterCount: 25,
      samplesPerCluster: 40,
      sequenceCount: 1000,
      sequenceLength: 1800,
      snpThreshold: 16,
      tier: 'expanded-large',
      distancePath: 'generated-fasta-snp',
    },
  },
];

const stressScenarios: BootstrapPerfScenario[] = [
  {
    id: 'bootstrap-stress-clustered-sequences-2000',
    title: 'Bootstrap performance: stress generated FASTA, 2000 aligned sequences',
    files: [
      {
        name: 'performance/stress-sequences-2000.fasta',
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 2000,
      totalLinks: 1999000,
      visibleLinks: 49000,
      sequences: 2000,
    },
    timeoutMs: 900000,
    metadata: {
      fixtureKind: 'deterministic-generated-clustered',
      generator: 'scripts/generate-performance-fixtures.js',
      clusterCount: 40,
      samplesPerCluster: 50,
      sequenceCount: 2000,
      sequenceLength: 1800,
      snpThreshold: 16,
      tier: 'stress',
      distancePath: 'generated-fasta-snp',
      manualOnly: true,
    },
  },
];

function selectedScenarios(): BootstrapPerfScenario[] {
  const scenarios = Cypress.env('perfBootstrapStress')
    ? [...coreScenarios, ...stressScenarios]
    : coreScenarios;

  return scenarioFilter.length
    ? scenarios.filter((scenario) => scenarioFilter.includes(scenario.id))
    : scenarios;
}

function buildResultScenario(
  baseScenario: BootstrapPerfScenario,
  phase: 'single-tree' | 'bootstrap',
  bootstrapReplicates?: number,
): PerformanceScenario {
  const replicateSuffix = phase === 'bootstrap'
    ? `${bootstrapReplicates}-replicates`
    : phase;
  const replicateTitle = phase === 'bootstrap'
    ? `${bootstrapReplicates} bootstrap replicates`
    : 'single tree generation';

  return {
    ...baseScenario,
    id: `${baseScenario.id}-${replicateSuffix}`,
    title: `${baseScenario.title} (${replicateTitle})`,
    metadata: {
      ...baseScenario.metadata,
      phase,
      bootstrapReplicates: bootstrapReplicates ?? 0,
      stopWhenStable: false,
    },
  };
}

function withResultMetrics(
  measurement: PerformanceMeasurement,
  scenarioId: string,
  metrics: Record<string, number | null>,
  win: PerfWindow,
): PerformanceMeasurement {
  return {
    ...measurement,
    scenarioId,
    metrics: {
      ...measurement.metrics,
      ...metrics,
    },
    counts: collectPerformanceCounts(win),
    app: {
      ...measurement.app,
      performance: win.commonService?.session?.meta?.performance,
    },
  };
}

function measureSingleTreeGeneration(
  measurement: PerformanceMeasurement,
  scenario: BootstrapPerfScenario,
): Cypress.Chainable<PerformanceMeasurement> {
  const resultScenario = buildResultScenario(scenario, 'single-tree');

  return cy.window().then({ timeout: scenario.timeoutMs }, (win: unknown) => {
    const perfWindow = win as PerfWindow;
    const startedAt = perfWindow.performance.now();

    return perfWindow.commonService.computeTree().then((newickString: string) => {
      const durationMs = perfWindow.performance.now() - startedAt;
      perfWindow.commonService.session.data.newickString = newickString;

      expect(newickString, `${scenario.id} generated Newick`).to.be.a('string').and.not.be.empty;

      return withResultMetrics(
        measurement,
        resultScenario.id,
        {
          phylogeneticTreeGenerationMs: durationMs,
          phylogeneticGeneratedNewickLength: newickString.length,
        },
        perfWindow,
      );
    });
  }).then((treeMeasurement) => writePerformanceResult(resultScenario, treeMeasurement)
    .then(() => treeMeasurement));
}

function measureBootstrapReplicates(
  measurement: PerformanceMeasurement,
  scenario: BootstrapPerfScenario,
  replicates: number,
): Cypress.Chainable<PerformanceMeasurement> {
  const resultScenario = buildResultScenario(scenario, 'bootstrap', replicates);
  const bootstrapTimeoutMs = Math.max(
    scenario.timeoutMs,
    Number(Cypress.env('perfBootstrapTimeoutMs') || 0),
    replicates >= 1000 ? scenario.timeoutMs * 4 : scenario.timeoutMs,
  );

  return cy.window().then({ timeout: bootstrapTimeoutMs }, (win: unknown) => {
    const perfWindow = win as PerfWindow;
    const phylo = perfWindow.commonService.visuals.phylogenetic;

    phylo.SelectedBootstrapCustomReplicates = replicates;
    phylo.SelectedBootstrapStopWhenStable = false;
    phylo.settings['tree-bootstrap-custom-replicates'] = replicates;
    phylo.settings['tree-bootstrap-stop-when-stable'] = false;

    const startedAt = perfWindow.performance.now();

    return phylo.calculateBootstrapSupport({ skipConfirmation: true }).then(() => {
      const durationMs = perfWindow.performance.now() - startedAt;
      const metadata = perfWindow.commonService.session.data.phylogeneticBootstrap;

      expect(metadata, `${scenario.id} bootstrap metadata`).to.exist;
      expect(metadata.requestedReplicates, `${scenario.id} requested bootstrap replicates`).to.equal(replicates);
      expect(metadata.completedReplicates, `${scenario.id} completed bootstrap replicates`).to.equal(replicates);
      expect(Object.keys(metadata.supportBySplitKey || {}).length, `${scenario.id} bootstrap split count`)
        .to.be.greaterThan(0);

      return withResultMetrics(
        measurement,
        resultScenario.id,
        {
          bootstrapReplicatesRequested: replicates,
          bootstrapReplicatesCompleted: metadata.completedReplicates,
          bootstrapSupportCalculationMs: durationMs,
          bootstrapSplitCount: Object.keys(metadata.supportBySplitKey || {}).length,
        },
        perfWindow,
      );
    });
  }).then((bootstrapMeasurement) => writePerformanceResult(resultScenario, bootstrapMeasurement)
    .then(() => bootstrapMeasurement));
}

describeBootstrapPerf('Performance Baseline - phylogenetic bootstrap generation', () => {
  selectedScenarios().forEach((scenario) => {
    it(`records single-tree and bootstrap timings for ${scenario.id}`, () => {
      expect(replicateCounts, 'configured bootstrap replicate counts').to.not.be.empty;

      launchPerformanceScenarioToTwoD(scenario, scenario.timeoutMs)
        .then((measurement) => measureSingleTreeGeneration(measurement, scenario))
        .then((measurement) => {
          goToPhyloTreeView(scenario.timeoutMs);
          return cy.wrap(measurement, { log: false });
        })
        .then((measurement) => replicateCounts.reduce(
          (chain, replicates) => chain.then((currentMeasurement) => (
            measureBootstrapReplicates(currentMeasurement, scenario, replicates)
          )),
          cy.wrap(measurement, { log: false }),
        ));
    });
  });
});
