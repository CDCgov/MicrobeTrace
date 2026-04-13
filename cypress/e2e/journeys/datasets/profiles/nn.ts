// cypress/e2e/journeys/datasets/profiles/nn.ts
import type { DatasetProfile } from '../types';
import { P } from '../types';

export const NN_PROFILES: DatasetProfile[] = [
  P({
    id: 'nn-snps16-edgelist',
    title: 'NN: SNPs=16 via distance edgelist',
    tags: ['nn', 'snps', 'edgelist', 'load-to-twod', 'load-to-bubble'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 46 },
        after: { visibleLinks: 17 },
      },
    },
  }),

  P({
    id: 'nn-snps16-matrix',
    title: 'NN: SNPs=16 via distance matrix',
    tags: ['nn', 'snps', 'matrix', 'load-to-twod', 'load-to-bubble'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 91 },
        after: { visibleLinks: 13 },
      },
    },
  }),

  P({
    id: 'nn-snps16-fasta',
    title: 'NN: SNPs=16 via FASTA',
    tags: ['nn', 'snps', 'fasta', 'load-to-twod', 'load-to-bubble'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 30 },
        after: { visibleLinks: 13 },
      },
    },
  }),

  P({
    id: 'nn-angulartesting-tn93-edgelist',
    title: 'NN Contract: AngularTesting distance edgelist loads 17 TN93 links and prunes to 10',
    tags: ['nn-contract', 'nn-epsilon', 'angulartesting', 'tn93', 'edgelist', 'load-to-twod'],
    files: [
      {
        name: 'AngularTesting_Distance_linklist_BS.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 17 },
        after: { visibleLinks: 10 },
      },
      filtering: {
        epsilonAfterNearestNeighbor: {
          fromExponent: -8,
          steps: [
            {
              toExponent: -1,
              after: { visibleLinks: 12 },
            },
            {
              toExponent: 0,
              after: { visibleLinks: 17 },
            },
          ],
        },
      },
    },
  }),

  P({
    id: 'nn-angulartesting-tn93-matrix',
    title: 'NN Contract: AngularTesting distance matrix loads 17 TN93 links and prunes to 10',
    tags: ['nn-contract', 'nn-epsilon', 'angulartesting', 'tn93', 'matrix', 'load-to-twod'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 17 },
        after: { visibleLinks: 10 },
      },
      filtering: {
        epsilonAfterNearestNeighbor: {
          fromExponent: -8,
          steps: [
            {
              toExponent: -1,
              after: { visibleLinks: 12 },
            },
            {
              toExponent: 0,
              after: { visibleLinks: 17 },
            },
          ],
        },
      },
    },
  }),

  P({
    id: 'nn-angulartesting-snps16-fasta',
    title: 'NN Contract: AngularTesting FASTA loads 11 links and prunes to 7',
    tags: ['nn-contract', 'angulartesting', 'snps', 'fasta', 'load-to-twod'],
    files: [
      {
        name: 'AngularTesting_seqs_TN93_BS.fasta',
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
        visibleLinks: 11,
      },
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 11 },
        after: { visibleLinks: 7 },
      },
    },
  }),
];
