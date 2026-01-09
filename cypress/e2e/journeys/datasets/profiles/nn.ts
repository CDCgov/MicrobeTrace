// cypress/e2e/journeys/datasets/profiles/nn.ts
import type { DatasetProfile } from '../types';
import { P } from '../types';

export const NN_PROFILES: DatasetProfile[] = [
  P({
    id: 'nn-snps16-edgelist',
    title: 'NN: SNPs=16 via distance edgelist',
    tags: ['nn', 'snps', 'edgelist'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 11 },
        after: { visibleLinks: 7 },
      },
    },
  }),

  P({
    id: 'nn-snps16-matrix',
    title: 'NN: SNPs=16 via distance matrix',
    tags: ['nn', 'snps', 'matrix'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 11 },
        after: { visibleLinks: 7 },
      },
    },
  }),

  P({
    id: 'nn-snps16-fasta',
    title: 'NN: SNPs=16 via FASTA',
    tags: ['nn', 'snps', 'fasta'],
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
      nn: {
        labelLinksWith: 'distance',
        before: { visibleLinks: 11 },
        after: { visibleLinks: 7 },
      },
    },
  }),
];
