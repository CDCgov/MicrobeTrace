// cypress/e2e/journeys/datasets/profiles/grouping.ts
import type { DatasetProfile } from '../types';
import { P } from '../types';

export const GROUPING_PROFILES: DatasetProfile[] = [
  P({
    id: 'grouping-basic-tn93-epi-linklist-cluster',
    title: 'Grouping (basic): Epi link list → group by Cluster (default)',
    tags: ['grouping', 'grouping-basic', 'cluster', 'tn93', 'epi'],
    files: [
      {
        name: 'AngularTesting_Epi_linklist_BS.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        // no field3 needed for this fixture if "Distance" is not present/used
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
      grouping: {
        groupBy: 'Cluster',
        showGroups: true,
        showGroupColors: false,
        showGroupLabels: false,
      },
    },
  }),

  P({
    id: 'grouping-tn93-polygons-subtype',
    title: 'Grouping: TN93 polygons grouped by Subtype, colors + labels, threshold change does not break polygons',
    tags: ['grouping', 'polygons', 'tn93'],
    files: [
      { name: 'AngularTesting_DistanceMatrix_TN93_BS.xlsx', datatype: 'matrix' },
      { name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv', datatype: 'node' },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: 0.015,
      defaultView: '2D Network',
    },
    expectations: {
      grouping: {
        groupBy: 'Subtype',
        showGroups: true,
        showGroupColors: true,
        showGroupLabels: true,
        changeGroupColors: {
          groups: ['B', 'D'],
        },
        thresholdChange: {
          from: 0.015,
          to: 0.010,
          expectedVisibleLinksAfter: 9,
          expectPolygonsUnchanged: true,
        },
      },
    },
  }),
];
