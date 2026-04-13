import type { DatasetProfile } from '../types';
import { P } from '../types';

export const PHYLO_PROFILES: DatasetProfile[] = [
  P({
    id: 'phylo-covid-metadata-threshold',
    title: 'Load to Phylogenetic Tree: metadata-backed SNP upload keeps tree controls meaningful across threshold changes',
    tags: ['phylo', 'phylo-controls', 'phylo-metadata', 'snps'],
    files: [
      {
        name: 'COVID-19_simulated_NodeList_snp.csv',
        datatype: 'node',
        field1: 'ID',
        field2: 'seq',
      },
      {
        name: 'COVID_Dummy_distance_edgelist_snp.csv',
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
    expectations: {
      afterLaunch: {
        nodes: 33,
        visibleLinks: 46,
        clusters: 4,
        singletons: 13,
      },
    },
  }),
  P({
    id: 'phylo-snps16-edgelist',
    title: 'Load to Phylogenetic Tree: SNP distance edgelist launches a rendered 30-leaf tree',
    tags: ['phylo-smoke', 'phylo', 'edgelist', 'snps'],
    files: [
      {
        name: 'COVID_Dummy_distance_edgelist_snp.csv',
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
    expectations: {
      afterLaunch: {
        nodes: 30,
        visibleLinks: 46,
        clusters: 4,
        singletons: 10,
      },
    },
  }),
  P({
    id: 'phylo-snps16-matrix',
    title: 'Load to Phylogenetic Tree: distance matrix launches a rendered 14-leaf tree',
    tags: ['phylo-smoke', 'phylo', 'matrix', 'snps'],
    files: [
      {
        name: 'AngularTesting_DistanceMatrix_TN93_BS.xlsx',
        datatype: 'matrix',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 14,
        visibleLinks: 91,
        clusters: 1,
        singletons: 0,
      },
    },
  }),
  P({
    id: 'phylo-snps16-fasta',
    title: 'Load to Phylogenetic Tree: FASTA launches a rendered 30-leaf tree',
    tags: ['phylo-smoke', 'phylo', 'fasta', 'snps'],
    files: [
      {
        name: 'SARSCoV2_Simulated_Sequences_snp.fas',
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 30,
        visibleLinks: 30,
        clusters: 4,
        singletons: 14,
      },
    },
  }),
  P({
    id: 'phylo-tn93-sequence-node-list',
    title: 'Load to Phylogenetic Tree: sequence node list launches a rendered 14-leaf tree',
    tags: ['phylo-smoke', 'phylo', 'node-sequences', 'tn93'],
    files: [
      {
        name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv',
        datatype: 'node',
        field1: '_id',
        field2: 'seq',
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
        visibleLinks: 17,
        clusters: 2,
        singletons: 2,
      },
    },
  }),
  P({
    id: 'phylo-tn93-newick',
    title: 'Load to Phylogenetic Tree: TN93 Newick launches a rendered 14-leaf tree',
    tags: ['phylo-smoke', 'phylo', 'newick', 'tn93'],
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
