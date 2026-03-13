import type { DatasetProfile } from '../types';
import { P } from '../types';

export const NEWICK_PROFILES: DatasetProfile[] = [
  P({
    id: 'load-twod-newick-tn93-angular-testing',
    title: 'Load to 2D: AngularTesting TN93 Newick parses on TN93 threshold 0.015',
    tags: ['load-to-twod', 'newick', 'tn93', 'small'],
    files: [
      {
        name: 'AngularTesting_seqs_TN93_BS.nwk',
        datatype: 'newick',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.015,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 14,
        visibleLinks: 14,
        clusters: 2,
        singletons: 3,
      },
    },
  }),
];
