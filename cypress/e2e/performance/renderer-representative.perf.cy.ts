/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureRendererComparisonInteractions,
  prepareRendererFullDetail,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceRendererMode,
  type PerformanceScenario,
} from '../../support/perf-helpers';

type RealSampleManifest = {
  configured: boolean;
  manifestPath: string;
  scenarioCount: number;
  scenarios: PerformanceScenario[];
  missingFiles: Array<{ scenarioId: string; fileName: string; resolvedPath: string }>;
  invalidScenarios: Array<{ index: number; scenarioId?: string; reason: string }>;
};

const describeRepresentativeComparison = Cypress.env('perfMode')
  && Cypress.env('rendererRepresentative')
  ? describe
  : describe.skip;

const requestedRendererMode = String(Cypress.env('rendererMode') || 'paired');
const renderers: PerformanceRendererMode[] = requestedRendererMode === 'paired'
  ? ['cytoscape-webgl', 'sigma']
  : [requestedRendererMode as PerformanceRendererMode];
const configuredSampleCount = Number(Cypress.env('rendererSamples') || 1);
const sampleCount = Number.isFinite(configuredSampleCount)
  ? Math.max(1, Math.min(20, Math.floor(configuredSampleCount)))
  : 1;

function rendererScenario(
  source: PerformanceScenario,
  renderer: PerformanceRendererMode,
): PerformanceScenario {
  return {
    ...source,
    id: `renderer-${renderer}-${source.id}`,
    title: `Representative renderer comparison (${renderer}): ${source.title}`,
    renderer,
    rendererProfile: 'optimized',
    interactions: undefined,
    metadata: {
      ...(source.metadata || {}),
      comparisonTier: 'representative',
      representativeScenarioId: source.id,
      workload: ['initial-load', 'layout', 'pan', 'zoom', 'selection', 'memory'],
    },
  };
}

function assertRepresentativeRendererReady(
  scenario: PerformanceScenario,
  measurement: PerformanceMeasurement,
): void {
  const diagnostics = measurement.app.renderer;
  expect(diagnostics, 'renderer diagnostics').to.exist;
  expect(diagnostics?.requestedMode, 'requested renderer').to.equal(scenario.renderer);
  expect(diagnostics?.activeMode, 'active renderer').to.equal(scenario.renderer);
  expect(diagnostics?.residentNodeCount, 'renderer resident nodes')
    .to.equal(scenario.expected.nodes);
  expect(diagnostics?.residentEdgeCount, 'renderer resident edges')
    .to.equal(scenario.expected.visibleLinks);
  expect(diagnostics?.webglActive, 'WebGL benchmark validity').to.equal(true);

  const renderTimings = (measurement.app.performance as any)?.render;
  const layoutTiming = scenario.renderer === 'sigma'
    ? renderTimings?.twoDSigmaPocLayout
    : renderTimings?.twoDPrecomputePositions;
  expect(layoutTiming?.strategy, 'shared optimized layout strategy')
    .to.equal('shared-d3-force-backbone');
  expect(layoutTiming?.layoutLinks, 'shared layout workload').to.be.greaterThan(0);
  expect(layoutTiming?.layoutLinks, 'shared layout workload')
    .to.be.at.most(scenario.expected.visibleLinks);
}

function runRepresentativeScenario(
  scenario: PerformanceScenario,
  sampleIndex: number,
): Cypress.Chainable<unknown> {
  const timeout = typeof scenario.timeoutMs === 'number' ? scenario.timeoutMs : 300000;

  Cypress.log({
    name: 'rendererRepresentative',
    message: `${scenario.renderer} / ${scenario.metadata?.representativeScenarioId} / sample ${sampleIndex + 1}`,
  });

  return launchPerformanceScenarioToTwoD(scenario, timeout)
    .then((measurement) => {
      measurement.metrics.rendererSampleIndex = sampleIndex + 1;
      assertRepresentativeRendererReady(scenario, measurement);
      return prepareRendererFullDetail(measurement);
    })
    .then((measurement) => {
      expect(
        measurement.app.renderer?.drawnEdgeCount,
        'full-detail rendered edge count',
      ).to.equal(scenario.expected.visibleLinks);
      return measureRendererComparisonInteractions(measurement);
    })
    .then((measurement) => writePerformanceResult(scenario, measurement));
}

describeRepresentativeComparison(
  `Optimized representative renderer comparison - ${requestedRendererMode}`,
  () => {
    it(`runs the same configured MT samples through both renderers (${sampleCount} sample(s))`, () => {
      cy.task('perf:readRealSampleManifest').then((response) => {
        const manifest = response as RealSampleManifest;

        expect(manifest.configured, `real-sample manifest at ${manifest.manifestPath}`).to.equal(true);
        expect(manifest.scenarioCount, 'enabled representative scenarios').to.be.greaterThan(0);
        expect(manifest.invalidScenarios, 'invalid representative scenarios').to.deep.equal([]);
        expect(manifest.missingFiles, 'missing representative fixture files').to.deep.equal([]);

        const runs: Array<{ scenario: PerformanceScenario; sampleIndex: number }> = [];
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const orderedRenderers = sampleIndex % 2 === 0
            ? renderers
            : [...renderers].reverse();

          manifest.scenarios.forEach(source => {
            orderedRenderers.forEach(renderer => {
              runs.push({
                scenario: rendererScenario(source, renderer),
                sampleIndex,
              });
            });
          });
        }

        return runs.reduce<Cypress.Chainable<unknown>>(
          (chain, run) => chain.then(() => (
            runRepresentativeScenario(run.scenario, run.sampleIndex)
          )),
          cy.wrap(null, { log: false }),
        );
      });
    });
  },
);
