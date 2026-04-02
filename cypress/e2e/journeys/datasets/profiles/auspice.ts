import type { DatasetProfile } from '../types';
import { P } from '../types';

export const AUSPICE_PROFILES: DatasetProfile[] = [
  P({
    id: 'load-twod-auspice-patristic',
    title: 'Load to 2D: AngularTesting Auspice parses as patristic',
    tags: ['load-to-twod', 'auspice', 'newick', 'patristic'],
    files: [
      {
        name: 'AngularTesting_tiny_auspice_tree.json',
        datatype: 'auspice',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 4,
        visibleLinks: 3,
      },
    },
  }),
];
