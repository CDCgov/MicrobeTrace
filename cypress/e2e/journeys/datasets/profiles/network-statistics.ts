import type { DatasetProfile } from '../types';
import { P } from '../types';

export const NETWORK_STATISTICS_PROFILES: DatasetProfile[] = [
  P({
    id: 'network-statistics-panel',
    title: 'Network Statistics: deterministic panel and export fixture',
    tags: ['network-statistics', 'load-to-twod', 'filtering'],
    files: [
      { name: 'NetworkStatisticsNodes.csv', datatype: 'node', field1: '_id' },
      {
        name: 'NetworkStatisticsLinks.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 1,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 6,
        visibleLinks: 6,
        clusters: 1,
        singletons: 0,
      },
    },
  }),
];
