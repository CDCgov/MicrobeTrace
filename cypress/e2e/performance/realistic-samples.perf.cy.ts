/// <reference types="cypress" />

import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import {
  goToAlignmentView,
  goToPhyloTreeView,
} from '../../support/journey-helpers';

type RealisticFixtureSummary = {
  id: string;
  outputs: {
    fasta: string;
    newick: string;
    nodeMetadata: string;
  };
  counts: {
    nodes: number;
    sequences: number;
    leaves: number;
    totalPairs: number;
    snp: {
      visibleLinksByThreshold: Record<string, number>;
    };
    patristic: {
      visibleLinksByThreshold: Record<string, number>;
    };
  };
  cypress: {
    snpThreshold: number;
    patristicThreshold: number;
    timeoutMs?: number;
  };
  preset?: Record<string, unknown>;
};

const describeRealisticPerf = Cypress.env('perfMode') && Cypress.env('perfRealisticSamples')
  ? describe
  : describe.skip;

const summaryFixture = 'performance/realistic/pathogen-musse-500-summary.json';

function visibleLinksFor(summary: RealisticFixtureSummary, kind: 'snp' | 'patristic', threshold: number): number {
  const values = kind === 'snp'
    ? summary.counts.snp.visibleLinksByThreshold
    : summary.counts.patristic.visibleLinksByThreshold;
  const value = values[String(threshold)];
  expect(value, `${kind} visible links at threshold ${threshold}`).to.be.a('number');
  return value;
}

function buildFastaScenario(summary: RealisticFixtureSummary): PerformanceScenario {
  const threshold = summary.cypress.snpThreshold;
  return {
    id: `${summary.id}-fasta`,
    title: 'Bio-realistic MuSSE + AliSim FASTA with node metadata',
    files: [
      {
        name: summary.outputs.nodeMetadata,
        datatype: 'node',
        field1: '_id',
        field2: 'seq_id',
      },
      {
        name: summary.outputs.fasta,
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold,
      defaultView: '2D Network',
    },
    expected: {
      nodes: summary.counts.nodes,
      totalLinks: summary.counts.totalPairs,
      visibleLinks: visibleLinksFor(summary, 'snp', threshold),
      sequences: summary.counts.sequences,
    },
    metadata: {
      fixtureKind: 'bio-realistic-simulated',
      generator: 'scripts/generate-realistic-performance-fixtures.js',
      preset: summary.id,
      distancePath: 'alisim-fasta-snp',
    },
  };
}

function buildNewickScenario(summary: RealisticFixtureSummary): PerformanceScenario {
  const threshold = summary.cypress.patristicThreshold;
  const visibleLinks = visibleLinksFor(summary, 'patristic', threshold);
  return {
    id: `${summary.id}-newick`,
    title: 'Bio-realistic MuSSE Newick with patristic distances',
    files: [
      {
        name: summary.outputs.newick,
        datatype: 'newick',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold,
      defaultView: '2D Network',
    },
    expected: {
      nodes: summary.counts.leaves,
      totalLinks: visibleLinks,
      visibleLinks,
    },
    metadata: {
      fixtureKind: 'bio-realistic-simulated',
      generator: 'scripts/generate-realistic-performance-fixtures.js',
      preset: summary.id,
      distancePath: 'musse-newick-patristic',
    },
  };
}

describeRealisticPerf('Performance Baseline - bio-realistic simulated fixtures', () => {
  it('records FASTA load, 2D readiness, and Alignment view readiness', () => {
    cy.fixture(summaryFixture).then((summary: RealisticFixtureSummary) => {
      const scenario = buildFastaScenario(summary);
      const timeout = summary.cypress.timeoutMs || 300000;

      launchPerformanceScenarioToTwoD(scenario, timeout)
        .then((measurement) => appendMeasuredView(measurement, 'alignment', goToAlignmentView))
        .then((measurement) => {
          expect(measurement.counts.sequencesWithData, 'Alignment sequence count')
            .to.equal(summary.counts.sequences);
          return writePerformanceResult(scenario, measurement);
        });
    });
  });

  it('records Newick load, 2D readiness, and Phylogenetic Tree readiness', () => {
    cy.fixture(summaryFixture).then((summary: RealisticFixtureSummary) => {
      const scenario = buildNewickScenario(summary);
      const timeout = summary.cypress.timeoutMs || 300000;

      launchPerformanceScenarioToTwoD(scenario, timeout)
        .then((measurement) => appendMeasuredView(measurement, 'phylogeneticTree', goToPhyloTreeView))
        .then((measurement) => writePerformanceResult(scenario, measurement));
    });
  });
});
