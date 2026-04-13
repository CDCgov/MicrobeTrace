import type { DatasetProfile } from '../types';
import { P } from '../types';

export const ALIGNMENT_PROFILES: DatasetProfile[] = [
  P({
    id: 'alignment-angulartesting-fasta',
    title: 'Alignment: FASTA launch then switch renders the sequence canvas',
    tags: ['alignment', 'load-to-alignment', 'fasta', 'snps'],
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
        nodes: 14,
        visibleLinks: 11,
      },
      alignment: {
        visibleSequences: 14,
        excludedNodeIds: [],
      },
    },
  }),
  P({
    id: 'alignment-angulartesting-sequence-node-list',
    title: 'Alignment: sequence node list launch then switch renders deterministic labels and canvas state',
    tags: ['alignment', 'load-to-alignment', 'node', 'tn93'],
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
      alignment: {
        visibleSequences: 14,
        excludedNodeIds: [],
      },
    },
  }),
  P({
    id: 'alignment-covid-node-link-excluded',
    title: 'Alignment: node plus distance-link launch then switch excludes missing sequences and keeps the sequence canvas stable',
    tags: ['alignment', 'load-to-alignment', 'node-link', 'snps'],
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
      alignment: {
        visibleSequences: 30,
        excludedNodeIds: ['P1', 'P2', 'P3'],
      },
    },
  }),
];
