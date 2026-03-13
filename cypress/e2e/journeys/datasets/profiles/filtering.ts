import type { DatasetProfile } from '../types';
import { P } from '../types';

export const FILTERING_PROFILES: DatasetProfile[] = [
  P({
    id: 'filtering-min-cluster-reveal-epi-linklist',
    title: 'Filtering: minimum cluster size hides the 2-node cluster and Reveal Everything restores it',
    tags: ['filtering', 'filtering-cluster-minimum', 'reveal', 'tn93', 'epi'],
    files: [
      {
        name: 'AngularTesting_Epi_linklist_BS.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.015,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 10,
        visibleLinks: 7,
        clusters: 3,
        singletons: 0,
      },
      filtering: {
        minimumClusterSize: {
          from: 1,
          to: 3,
          after: {
            nodes: 8,
            visibleLinks: 6,
            clusters: 2,
            singletons: 0,
          },
          hiddenNodeIds: ['KF773576', 'KF773579'],
          reveal: {
            expectedCounts: {
              nodes: 10,
              visibleLinks: 7,
              clusters: 3,
              singletons: 0,
            },
            restoredNodeIds: ['KF773576', 'KF773579'],
          },
        },
      },
    },
  }),
  P({
    id: 'filtering-mixed-origin-nearest-neighbor',
    title: 'Filtering: mixed-origin nearest neighbor confirms before pruning and preserves epi-backed links',
    tags: ['filtering', 'mixed-origin', 'nn-mixed-origin', 'tn93', 'load-to-twod'],
    files: [
      {
        name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv',
        datatype: 'node',
        field1: '_id',
        field2: 'seq',
      },
      {
        name: 'AngularTesting_Epi_linklist_BS.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
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
      filtering: {
        mixedOriginNearestNeighbor: {
          multiOriginLinks: 7,
          cancel: {
            visibleLinks: 17,
          },
          confirm: {
            visibleLinks: 12,
          },
          preservedLinkIds: [
            'KF773576-KF773579',
            'KF773429-KF773430',
          ],
        },
      },
    },
  }),
  P({
    id: 'filtering-metric-switch-sequence-node-list',
    title: 'Filtering: post-launch metric switch on sequence node list updates threshold and visible links',
    tags: ['filtering', 'metric-switch', 'sequence', 'tn93', 'snps', 'load-to-twod'],
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
      filtering: {
        metricSwitch: {
          steps: [
            {
              toMetric: 'snps',
              expectedThreshold: 16,
              after: { visibleLinks: 11 },
            },
            {
              toMetric: 'tn93',
              expectedThreshold: 0.015,
              after: { visibleLinks: 17 },
            },
          ],
        },
      },
    },
  }),
  P({
    id: 'filtering-metric-switch-fasta',
    title: 'Filtering: post-launch metric switch on FASTA updates threshold and visible links',
    tags: ['filtering', 'metric-switch', 'fasta', 'tn93', 'snps', 'load-to-twod'],
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
      filtering: {
        metricSwitch: {
          steps: [
            {
              toMetric: 'tn93',
              expectedThreshold: 0.015,
              after: { visibleLinks: 17 },
            },
            {
              toMetric: 'snps',
              expectedThreshold: 16,
              after: { visibleLinks: 11 },
            },
          ],
        },
      },
    },
  }),
];
