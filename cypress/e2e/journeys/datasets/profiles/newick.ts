import type { DatasetProfile } from '../types';
import { P } from '../types';

export const NEWICK_PROFILES: DatasetProfile[] = [
  P({
    id: 'load-phylo-tree-newick-snp',
    title: 'Load to Phylogenetic Tree: SARSCoV2 SNP Newick',
    tags: ['load-to-phylo-tree', 'newick', 'snp'],
    files: [
      {
        name: 'SARSCoV2_Simulated_Sequences_NJ_tree_snp.nwk',
        datatype: 'newick',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 15,
      defaultView: 'Phylogenetic Tree',
    },
    expectations: {},
  }),
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
  P({
    id: 'load-twod-newick-tiny-replace-source',
    title: 'Load to 2D: tiny patristic source tree for replace-path testing',
    tags: ['load-to-twod', 'newick', 'patristic', 'small'],
    files: [
      {
        name: 'AngularTesting_tiny_newick_a.nwk',
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
        nodes: 3,
        visibleLinks: 3,
      },
    },
  }),
  P({
    id: 'load-twod-newick-tiny-replace-target',
    title: 'Load to 2D: tiny patristic replacement tree',
    tags: ['load-to-twod', 'newick', 'patristic', 'small'],
    files: [
      {
        name: 'AngularTesting_tiny_newick_b.nwk',
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
        nodes: 2,
        visibleLinks: 1,
      },
    },
  }),
];
