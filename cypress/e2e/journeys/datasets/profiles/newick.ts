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
    id: 'load-phylo-tree-newick-snp-via-twod',
    title: 'Load to Phylogenetic Tree via 2D launch: SARSCoV2 SNP Newick',
    tags: ['load-to-phylo-tree', 'newick', 'snp', 'stable-launch'],
    files: [
      {
        name: 'SARSCoV2_Simulated_Sequences_NJ_tree_snp.nwk',
        datatype: 'newick',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 15,
      defaultView: '2D Network',
    },
    expectations: {},
  }),
  P({
    id: 'load-twod-newick-tn93-angular-testing',
    title: 'Load to 2D: AngularTesting TN93 Newick parses on TN93 threshold 0.015',
    tags: ['load-to-twod', 'load-to-bubble', 'newick', 'tn93', 'small'],
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
