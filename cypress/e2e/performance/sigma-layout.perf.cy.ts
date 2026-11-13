/// <reference types="cypress" />

import { launchPerformanceScenarioToTwoD, writePerformanceResult, type PerformanceScenario } from '../../support/perf-helpers';
import { finishSigmaLayoutLoad, installSigmaLayoutProbe, launchSigmaSession, measureSigmaLayoutAction } from '../../support/sigma-layout-perf';
import nextstrain from '../../fixtures/performance/sigma-layout-nextstrain.json';

const describeLayout = Cypress.env('perfMode') && Cypress.env('perfSigmaLayout') ? describe : describe.skip;
const requestedTier = String(Cypress.env('perfSigmaTier') || '');
const requestedCase = String(Cypress.env('perfSigmaLayoutCase') || 'all');
const timeout = 600000;
const graphTiers = [
  { tier: 'average', nodes: 1600, links: 3200 },
  { tier: 'large', nodes: 5000, links: 10000 },
  { tier: 'stress', nodes: 10000, links: 25000 },
].filter(item => !requestedTier || item.tier === requestedTier);
const runsCase = (name: string) => requestedCase === 'all' || requestedCase === name;

function recordRecalculation(scenario: PerformanceScenario): void {
  const recalculation = { ...scenario, id: `${scenario.id}-recalculate`, title: `${scenario.title}: recalculate`,
    metadata: { ...scenario.metadata, operation: 'recalculate' } };
  measureSigmaLayoutAction(recalculation, 'recalculate', timeout)
    .then(measurement => writePerformanceResult(recalculation, measurement));
}

function load(scenario: PerformanceScenario, session = false): void {
  const measurement = session ? launchSigmaSession(scenario, timeout)
    : launchPerformanceScenarioToTwoD(scenario, timeout, { renderer: 'sigma', beforeLoad: installSigmaLayoutProbe })
      .then(result => finishSigmaLayoutLoad(scenario, result, timeout));
  measurement.then(result => writePerformanceResult(scenario, result));
  recordRecalculation(scenario);
}

function increase(from: PerformanceScenario, threshold: number, visibleLinks: number): PerformanceScenario {
  expect(visibleLinks, 'planned links stay within guardrail').to.be.at.most(100000);
  const scenario: PerformanceScenario = {
    ...from,
    id: `${String(from.metadata!.datasetId)}-increase-${from.preLaunch.threshold}-to-${threshold}`,
    title: `${String(from.metadata!.datasetId)}: increase ${from.preLaunch.threshold} to ${threshold}`,
    preLaunch: { ...from.preLaunch, threshold },
    expected: { ...from.expected, visibleLinks },
    metadata: { ...from.metadata, operation: 'threshold-increase', fromThreshold: from.preLaunch.threshold },
  };
  measureSigmaLayoutAction(scenario, 'threshold', timeout)
    .then(measurement => writePerformanceResult(scenario, measurement));
  recordRecalculation(scenario);
  return scenario;
}

describeLayout('Performance - Sigma merge-aware layout and threshold increases', () => {
  graphTiers.forEach(({ tier, nodes, links }) => {
    function prepare(test: (scenario: PerformanceScenario, counts: Record<number, number>) => void): void {
      cy.fixture<string>(`performance/${tier}-graph-links.csv`).then(csv => {
        const distances = csv.trim().split(/\r?\n/).slice(1).map(line => Number(line.split(',')[2]));
        const counts = Object.fromEntries([4, 8, 12].map(threshold => [threshold, distances.filter(distance => distance <= threshold).length]));
        const datasetId = `sigma-layout-${tier}-${nodes}n`;
        const scenario: PerformanceScenario = {
          id: `${datasetId}-cold-4`, title: `${tier} graph: fresh layout at 4`,
          files: [
            { name: `performance/${tier}-graph-nodes.csv`, datatype: 'node', field1: '_id' },
            { name: `performance/${tier}-graph-links.csv`, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
          ],
          preLaunch: { metric: 'snps', threshold: 4, defaultView: '2D Network' },
          expected: { nodes, totalLinks: links, visibleLinks: counts[4] },
          metadata: { datasetId, tier, operation: 'cold-load', fixtureKind: 'deterministic-generated', renderer: 'sigma' },
        };
        test(scenario, counts);
      });
    }
    // In the complete run, the increase case already starts with this fresh load.
    if (requestedCase === 'cold') it(`${tier}: fresh layout at 4 and warm recalculation`, () => prepare(scenario => load(scenario)));
    if (runsCase('increase')) it(`${tier}: load at 4, increase to 8, then 12, and recalculate at each step`, () => prepare((scenario, counts) => {
      load(scenario);
      const step = increase(scenario, 8, counts[8]);
      increase(step, 12, counts[12]);
    }));
  });

  if (!requestedTier || requestedTier === 'nextstrain') {
    const makeSessionScenario = (threshold: 1 | 5 | 7): PerformanceScenario => ({
      id: `sigma-layout-nextstrain-cold-${threshold}`,
      title: `Nextstrain saved session: fresh layout at ${threshold}`,
      files: [{ name: nextstrain.file, datatype: 'MT/other' }],
      preLaunch: { metric: 'snps', threshold, defaultView: '2D Network' },
      expected: { nodes: nextstrain.nodes, visibleLinks: nextstrain.visibleLinksByThreshold[String(threshold) as '1' | '5' | '7'] },
      metadata: { datasetId: 'sigma-layout-nextstrain', tier: 'nextstrain', operation: 'cold-load', renderer: 'sigma',
        fixtureKind: 'frozen-session-without-positions', fixtureSha256: nextstrain.sha256 },
    });
    if (runsCase('cold')) ([1, 5, 7] as const).forEach(threshold => {
      if (threshold === 1 && runsCase('increase')) return;
      it(`Nextstrain: fresh session at ${threshold} and warm recalculation`, () => load(makeSessionScenario(threshold), true));
    });
    if (runsCase('increase')) it('Nextstrain: load at 1, increase to 5, then 7, and recalculate at each step', () => {
      const start = makeSessionScenario(1);
      load(start, true);
      const step = increase(start, 5, nextstrain.visibleLinksByThreshold['5']);
      increase(step, 7, nextstrain.visibleLinksByThreshold['7']);
    });
  }
});
