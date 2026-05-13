/// <reference types="cypress" />

import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import {
  goToAlignmentView,
  goToPhyloTreeView,
} from '../../support/journey-helpers';

type RealSampleManifest = {
  configured: boolean;
  manifestPath: string;
  scenarioCount: number;
  scenarios: PerformanceScenario[];
  missingFiles: Array<{ scenarioId: string; fileName: string; resolvedPath: string }>;
  invalidScenarios: Array<{ index: number; scenarioId?: string; reason: string }>;
};

const describeRealPerf = Cypress.env('perfMode') && Cypress.env('perfRealSamples')
  ? describe
  : describe.skip;

function appendConfiguredViews(
  measurement: PerformanceMeasurement,
  viewChecks: PerformanceScenario['viewChecks'] = [],
): Cypress.Chainable<PerformanceMeasurement> {
  return viewChecks.reduce<Cypress.Chainable<PerformanceMeasurement>>((chain, view) => (
    chain.then((currentMeasurement) => {
      if (view === 'alignment') {
        return appendMeasuredView(currentMeasurement, 'alignment', goToAlignmentView);
      }

      if (view === 'phylogeneticTree') {
        return appendMeasuredView(currentMeasurement, 'phylogeneticTree', goToPhyloTreeView);
      }

      throw new Error(`Unsupported real-sample view check: ${view}`);
    })
  ), cy.wrap(measurement, { log: false }));
}

function appendConfiguredInteractions(
  measurement: PerformanceMeasurement,
  scenario: PerformanceScenario,
): Cypress.Chainable<PerformanceMeasurement> {
  if (!scenario.interactions) {
    return cy.wrap(measurement, { log: false });
  }

  const options = typeof scenario.interactions === 'object'
    ? scenario.interactions
    : {};

  return measureTwoDInteractionResponsiveness(measurement, options);
}

function runRealSampleScenario(scenario: PerformanceScenario): Cypress.Chainable<unknown> {
  const timeout = typeof scenario.timeoutMs === 'number' ? scenario.timeoutMs : 300000;

  return launchPerformanceScenarioToTwoD(scenario, timeout)
    .then((measurement) => appendConfiguredInteractions(measurement, scenario))
    .then((measurement) => appendConfiguredViews(measurement, scenario.viewChecks))
    .then((measurement) => writePerformanceResult(scenario, measurement));
}

describeRealPerf('Performance Baseline - real sample scenarios', () => {
  it('runs configured real sample scenarios from the local manifest', () => {
    cy.task('perf:readRealSampleManifest').then((response) => {
      const manifest = response as RealSampleManifest;

      if (!manifest.configured || manifest.scenarioCount === 0) {
        Cypress.log({
          name: 'perfRealSamples',
          message: `No enabled real sample scenarios found at ${manifest.manifestPath}`,
        });
        return;
      }

      expect(manifest.invalidScenarios, 'invalid real sample scenarios').to.deep.equal([]);
      expect(manifest.missingFiles, 'missing real sample fixture files').to.deep.equal([]);

      return cy.wrap(manifest.scenarios, { log: false }).each((scenario) => (
        runRealSampleScenario(scenario as PerformanceScenario)
      ));
    });
  });
});
