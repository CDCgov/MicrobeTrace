/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
  type TwoDInteractionMeasurementOptions,
} from '../../support/perf-helpers';

type CompareScenario = {
  id: string;
  title: string;
  timeoutMs: number;
  scenario: Omit<PerformanceScenario, 'id' | 'title'>;
  interactions: TwoDInteractionMeasurementOptions;
};

const describeComparePerf = Cypress.env('perfMode') && Cypress.env('perfGeneticCompare')
  ? describe
  : describe.skip;

const comparePrefix = String(Cypress.env('perfComparePrefix') || 'compare-current');
const compareRef = String(Cypress.env('perfCompareRef') || 'current');
const includeStress = Boolean(Cypress.env('perfGeneticCompareStress'));
const scenarioFilter = String(Cypress.env('perfCompareScenario') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const baseScenarios: CompareScenario[] = [
  {
    id: 'average-clustered-sequences-120',
    title: 'Average clustered sequence FASTA',
    timeoutMs: 180000,
    scenario: {
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
        sequences: 120,
      },
      metadata: {
        fixtureKind: 'deterministic-generated-clustered',
        distancePath: 'generated-fasta-snp',
      },
    },
    interactions: {
      dragNodeId: 'SEQ0001',
    },
  },
  {
    id: 'large-clustered-sequences-300',
    title: 'Large clustered sequence FASTA',
    timeoutMs: 300000,
    scenario: {
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
        sequences: 300,
      },
      metadata: {
        fixtureKind: 'deterministic-generated-clustered',
        tier: 'large',
        distancePath: 'generated-fasta-snp',
      },
    },
    interactions: {
      dragNodeId: 'LSEQ0001',
      restoreTimeoutMs: 120000,
    },
  },
  {
    id: 'average-newick-500',
    title: 'Average generated Newick',
    timeoutMs: 240000,
    scenario: {
      files: [
        {
          name: 'performance/average-newick-500.nwk',
          datatype: 'newick',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.003,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 500,
      },
      metadata: {
        fixtureKind: 'deterministic-generated',
        distancePath: 'generated-newick-patristic',
      },
    },
    interactions: {
      dragNodeId: 'NWK0001',
      thresholdDuringChange: 0.001,
      restoreThreshold: 0.003,
      restoreTimeoutMs: 120000,
    },
  },
  {
    id: 'large-newick-1000',
    title: 'Large generated Newick',
    timeoutMs: 420000,
    scenario: {
      files: [
        {
          name: 'performance/large-newick-1000.nwk',
          datatype: 'newick',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.003,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 1000,
      },
      metadata: {
        fixtureKind: 'deterministic-generated',
        tier: 'large',
        distancePath: 'generated-newick-patristic',
      },
    },
    interactions: {
      dragNodeId: 'LNWK0001',
      thresholdDuringChange: 0.001,
      restoreThreshold: 0.003,
      restoreTimeoutMs: 180000,
    },
  },
  {
    id: 'real-large-distance-edgelist-1600',
    title: 'Real large distance edge list',
    timeoutMs: 300000,
    scenario: {
      files: [
        {
          name: 'LargeDataSet_Test_sequences_node.csv',
          datatype: 'node',
          field1: 'id',
        },
        {
          name: 'LargeDataSet_Test_sequences_Distedgelist.csv',
          datatype: 'link',
          field1: 'ID1',
          field2: 'ID2',
          field3: 'Distance',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.015,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 1600,
      },
      metadata: {
        fixtureKind: 'real-sample',
        distancePath: 'real-distance-edge-list',
      },
    },
    interactions: {
      thresholdDuringChange: 0.01,
      restoreThreshold: 0.015,
      restoreTimeoutMs: 120000,
    },
  },
  {
    id: 'real-large-distance-epi-sankey-1600',
    title: 'Real large distance edge list with epi links',
    timeoutMs: 300000,
    scenario: {
      files: [
        {
          name: 'LargeDataSet_Test_sequences_node_sankey.csv',
          datatype: 'node',
          field1: 'id',
        },
        {
          name: 'LargeDataSet_Test_sequences_Distedgelist.csv',
          datatype: 'link',
          field1: 'ID1',
          field2: 'ID2',
          field3: 'Distance',
        },
        {
          name: 'Large_Dataset_forTesting_epiLinks.csv',
          datatype: 'link',
          field1: 'ID1',
          field2: 'ID2',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.015,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 1600,
      },
      metadata: {
        fixtureKind: 'real-sample',
        distancePath: 'real-distance-edge-list-plus-epi-links',
      },
    },
    interactions: {
      thresholdDuringChange: 0.01,
      restoreThreshold: 0.015,
      restoreTimeoutMs: 120000,
    },
  },
];

const stressScenario: CompareScenario = {
  id: 'stress-newick-2000',
  title: 'Stress generated Newick',
  timeoutMs: 900000,
  scenario: {
    files: [
      {
        name: 'performance/stress-newick-2000.nwk',
        datatype: 'newick',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.003,
      defaultView: '2D Network',
    },
    expected: {
      nodes: 2000,
    },
    metadata: {
      fixtureKind: 'deterministic-generated',
      tier: 'stress',
      distancePath: 'generated-newick-patristic',
    },
  },
  interactions: {
    dragNodeId: 'SNWK0001',
    thresholdDuringChange: 0.001,
    restoreThreshold: 0.003,
    restoreTimeoutMs: 300000,
  },
};

function buildScenario(compareScenario: CompareScenario): PerformanceScenario {
  return {
    ...compareScenario.scenario,
    id: `${comparePrefix}-${compareScenario.id}`,
    title: `${compareScenario.title} (${compareRef})`,
    metadata: {
      ...(compareScenario.scenario.metadata || {}),
      compareRef,
      comparePrefix,
      interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
    },
  };
}

describeComparePerf('Performance Comparison - genetic and patristic distance interactions', () => {
  const allScenarios = includeStress
    ? [...baseScenarios, stressScenario]
    : baseScenarios;
  const scenarios = scenarioFilter.length
    ? allScenarios.filter((scenario) => scenarioFilter.includes(scenario.id))
    : allScenarios;

  scenarios.forEach((compareScenario) => {
    it(`records comparable load and interaction metrics for ${compareScenario.id}`, () => {
      const scenario = buildScenario(compareScenario);

      launchPerformanceScenarioToTwoD(scenario, compareScenario.timeoutMs)
        .then((measurement) => measureTwoDInteractionResponsiveness(
          measurement,
          compareScenario.interactions,
        ))
        .then((measurement) => writePerformanceResult(scenario, measurement));
    });
  });
});
