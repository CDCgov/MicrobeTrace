import type { DatasetProfile } from '../types';
import { P } from '../types';

export const LOAD_PROFILES: DatasetProfile[] = [
  P({
    id: 'load-large-node-link-smoke',
    title: 'Load to 2D: large node list plus epi link list launches and renders sane counts',
    tags: ['load-to-twod', 'large-dataset', 'node-link', 'epi', 'snps'],
    files: [
      { name: 'LargeDataSet_Test_sequences_node.csv', datatype: 'node' },
      { name: 'Large_Dataset_forTesting_epiLinks.csv', datatype: 'link', field1: 'ID1', field2: 'ID2' },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 1600,
        visibleLinks: 59,
      },
    },
  }),
];
