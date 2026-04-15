import type { DatasetProfile } from '../types';
import { P } from '../types';

export const HEATMAP_PROFILES: DatasetProfile[] = [
  P({
    id: 'heatmap-snps-edgelist',
    title: 'Heatmap: uploaded SNP distance edgelist renders a Plotly matrix',
    tags: ['heatmap', 'load-to-heatmap', 'snps', 'edgelist'],
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
      },
    },
  }),
  P({
    id: 'heatmap-tn93-matrix',
    title: 'Heatmap: uploaded TN93 distance matrix renders a Plotly matrix',
    tags: ['heatmap', 'load-to-heatmap', 'tn93', 'matrix'],
    files: [
      {
        name: 'AngularTesting_DistanceMatrix_TN93_BS.xlsx',
        datatype: 'matrix',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.015,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        visibleLinks: 17,
      },
    },
  }),
  P({
    id: 'heatmap-snps-fasta',
    title: 'Heatmap: uploaded FASTA renders a Plotly matrix from derived SNP distances',
    tags: ['heatmap', 'load-to-heatmap', 'snps', 'fasta'],
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
      },
    },
  }),
  P({
    id: 'heatmap-snps-node-link',
    title: 'Heatmap: uploaded node and link files render a Plotly matrix',
    tags: ['heatmap', 'load-to-heatmap', 'snps', 'node-link'],
    files: [
      {
        name: 'TestStyleNodelist_snp.csv',
        datatype: 'node',
      },
      {
        name: 'TestStyleEdgelist_snp.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
      },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 24,
        visibleLinks: 12,
      },
    },
  }),
  P({
    id: 'heatmap-tn93-sequence-node-list',
    title: 'Heatmap: uploaded sequence node list renders a Plotly matrix from derived TN93 distances',
    tags: ['heatmap', 'load-to-heatmap', 'tn93', 'node-sequences'],
    files: [
      {
        name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv',
        datatype: 'node',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.015,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        visibleLinks: 17,
      },
    },
  }),
  P({
    id: 'heatmap-tn93-newick',
    title: 'Heatmap: uploaded Newick renders a Plotly matrix from patristic distances',
    tags: ['heatmap', 'load-to-heatmap', 'tn93', 'newick'],
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
      },
    },
  }),
];
