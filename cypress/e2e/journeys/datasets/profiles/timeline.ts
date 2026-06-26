import type { DatasetProfile } from '../types';
import { P } from '../types';

export const TIMELINE_PROFILES: DatasetProfile[] = [
  P({
    id: 'timeline-covid-node-link',
    title: 'Timeline: COVID node list plus SNP edge list updates the visible 2D network at deterministic checkpoints',
    tags: ['timeline', 'timeline-2d', 'load-to-twod', 'node-link', 'snps'],
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
      timeline: {
        field: 'Date of symptom onset Date',
        checkpoints: [
          {
            id: 'timeline-start',
            date: '6/28/2021',
            after: {
              nodes: 5,
              visibleLinks: 0,
              clusters: 0,
              singletons: 5,
            },
          },
          {
            id: 'timeline-mid',
            date: '7/16/2021',
            after: {
              nodes: 20,
              visibleLinks: 9,
              clusters: 2,
              singletons: 12,
            },
          },
          {
            id: 'timeline-max',
            date: '8/21/2021',
            after: {
              nodes: 33,
              visibleLinks: 46,
              clusters: 4,
              singletons: 13,
            },
          },
        ],
      },
    },
  }),
  P({
    id: 'timeline-angulartesting-mixed-origin',
    title: 'Timeline: mixed-origin AngularTesting launch keeps visible 2D membership coherent across diagnosis-date checkpoints',
    tags: ['timeline', 'timeline-2d', 'load-to-twod', 'mixed-origin', 'tn93'],
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
      timeline: {
        field: 'Diagnosis date',
        checkpoints: [
          {
            id: 'timeline-early',
            date: '9/24/2014',
            after: {
              nodes: 11,
              visibleLinks: 13,
              clusters: 2,
              singletons: 2,
            },
          },
          {
            id: 'timeline-max',
            date: '4/27/2015',
            after: {
              nodes: 14,
              visibleLinks: 17,
              clusters: 2,
              singletons: 2,
            },
          },
        ],
      },
    },
  }),
];
