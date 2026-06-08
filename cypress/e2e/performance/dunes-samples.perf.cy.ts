/// <reference types="cypress" />

import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import { goToAlignmentView } from '../../support/journey-helpers';

type DunesFixtureSummary = {
  id: string;
  outputs: {
    fasta: string;
    nodeMetadata: string;
  };
  counts: {
    nodes: number;
    sequences: number;
    totalPairs: number;
    snp: {
      visibleLinksByThreshold: Record<string, number>;
    };
  };
  cypress: {
    snpThreshold: number;
    timeoutMs?: number;
  };
};

const describeDunesPerf = Cypress.env('perfMode') && Cypress.env('perfDunesSamples')
  ? describe
  : describe.skip;

const summaryFixture = 'performance/dunes/hiv-like-dunes-500-summary.json';

function visibleLinksFor(summary: DunesFixtureSummary, threshold: number): number {
  const value = summary.counts.snp.visibleLinksByThreshold[String(threshold)];
  expect(value, `DUNES SNP visible links at threshold ${threshold}`).to.be.a('number');
  return value;
}

function buildDunesScenario(summary: DunesFixtureSummary): PerformanceScenario {
  const threshold = summary.cypress.snpThreshold;
  return {
    id: `${summary.id}-fasta`,
    title: 'DUNES generated FASTA with node metadata',
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
      visibleLinks: visibleLinksFor(summary, threshold),
      sequences: summary.counts.sequences,
    },
    metadata: {
      fixtureKind: 'simple-sequence-simulated',
      generator: 'scripts/generate-dunes-performance-fixtures.js',
      preset: summary.id,
      distancePath: 'dunes-fasta-snp',
    },
  };
}

describeDunesPerf('Performance Baseline - DUNES simulated sequence fixtures', () => {
  it('records DUNES FASTA load, 2D readiness, and Alignment readiness', () => {
    cy.fixture(summaryFixture).then((summary: DunesFixtureSummary) => {
      const scenario = buildDunesScenario(summary);
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
});
