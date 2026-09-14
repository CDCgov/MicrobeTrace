/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureRendererComparisonInteractions,
  prepareRendererFullDetail,
  writePerformanceResult,
  type PerformanceRendererMode,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeRendererComparison = Cypress.env('perfMode') && Cypress.env('rendererCompare')
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

const scenariosFor = (renderer: PerformanceRendererMode): PerformanceScenario[] => [
  {
    id: `renderer-${renderer}-average-1600n-3200l`,
    title: `Renderer comparison (${renderer}): average graph`,
    renderer,
    rendererProfile: 'optimized',
    files: [
      {
        name: 'performance/average-graph-nodes.csv',
        datatype: 'node',
        field1: '_id',
      },
      {
        name: 'performance/average-graph-links.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 1600,
      totalLinks: 3200,
      visibleLinks: 3200,
    },
    metadata: {
      fixtureKind: 'deterministic-generated',
      comparisonTier: 'average',
      workload: ['initial-load', 'layout', 'pan', 'zoom', 'selection', 'memory'],
    },
  },
  {
    id: `renderer-${renderer}-large-5000n-10000l`,
    title: `Renderer comparison (${renderer}): large graph`,
    renderer,
    rendererProfile: 'optimized',
    files: [
      {
        name: 'performance/large-graph-nodes.csv',
        datatype: 'node',
        field1: '_id',
      },
      {
        name: 'performance/large-graph-links.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 5000,
      totalLinks: 10000,
      visibleLinks: 10000,
    },
    metadata: {
      fixtureKind: 'deterministic-generated',
      comparisonTier: 'large',
      workload: ['initial-load', 'layout', 'pan', 'zoom', 'selection', 'memory'],
    },
  },
];

const scenarioByRendererAndTier = new Map<string, PerformanceScenario>();
renderers.forEach(renderer => {
  scenariosFor(renderer).forEach(scenario => {
    scenarioByRendererAndTier.set(
      `${renderer}:${scenario.metadata?.comparisonTier}`,
      scenario,
    );
  });
});

describeRendererComparison(`Optimized renderer comparison - ${requestedRendererMode}`, () => {
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const orderedRenderers = sampleIndex % 2 === 0 ? renderers : [...renderers].reverse();
    ['average', 'large'].forEach(tier => {
      orderedRenderers.forEach(renderer => {
        const scenario = scenarioByRendererAndTier.get(`${renderer}:${tier}`)!;
        it(`records ${renderer} ${tier} sample ${sampleIndex + 1} of ${sampleCount}`, () => {
          launchPerformanceScenarioToTwoD(scenario, 300000)
            .then((measurement) => {
              measurement.metrics.rendererSampleIndex = sampleIndex + 1;
              const diagnostics = measurement.app.renderer;
              expect(diagnostics, 'renderer diagnostics').to.exist;
              expect(diagnostics?.requestedMode, 'requested renderer').to.equal(scenario.renderer);
              expect(diagnostics?.activeMode, 'active renderer').to.equal(scenario.renderer);
              expect(diagnostics?.residentNodeCount, 'renderer resident nodes')
                .to.equal(scenario.expected.nodes);
              expect(diagnostics?.residentEdgeCount, 'renderer resident edges')
                .to.equal(scenario.expected.visibleLinks);
              if (scenario.renderer !== 'cytoscape-canvas') {
                expect(diagnostics?.webglActive, 'WebGL benchmark validity').to.equal(true);
              }
              const renderTimings = (measurement.app.performance as any)?.render;
              const layoutTiming = scenario.renderer === 'sigma'
                ? renderTimings?.twoDSigmaPocLayout
                : renderTimings?.twoDPrecomputePositions;
              expect(layoutTiming?.strategy, 'shared optimized layout strategy')
                .to.equal('shared-d3-force-backbone');
              expect(layoutTiming?.ticks, 'shared optimized layout tick count')
                .to.equal(tier === 'average' ? 180 : 90);
              expect(layoutTiming?.layoutLinks, 'shared sparse layout workload')
                .to.be.greaterThan(0)
                .and.lessThan(scenario.expected.visibleLinks);
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
        });
      });
    });
  }
});
