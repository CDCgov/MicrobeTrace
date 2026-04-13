import type { DatasetProfile } from '../types';
import { P } from '../types';

export const GANTT_PROFILES: DatasetProfile[] = [
  P({
    id: 'gantt-covid-node-link',
    title: 'Gantt: uploaded node plus distance-link data renders symptom-window entries for every loaded node',
    tags: ['gantt', 'load-to-gantt', 'node-link', 'snps'],
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
    id: 'gantt-angulartesting-sequence-node',
    title: 'Gantt: uploaded sequence node list renders date-range and single-date entries from node fields',
    tags: ['gantt', 'load-to-gantt', 'sequence-node', 'tn93'],
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
    id: 'gantt-cypress-edge-case-node-link',
    title: 'Gantt: synthetic node plus link dates cover sparse rows and timezone normalization',
    tags: ['gantt', 'load-to-gantt', 'node-link', 'edge-cases'],
    files: [
      {
        name: 'Cypress_GanttEdgeCasesNodes.csv',
        datatype: 'node',
      },
      {
        name: 'Cypress_GanttEdgeCasesLinks.csv',
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
        nodes: 4,
        visibleLinks: 3,
      },
    },
  }),
];
