import type { DatasetProfile } from '../types';
import { P } from '../types';

export const MAP_PROFILES: DatasetProfile[] = [
  P({
    id: 'map-covid-zipcode-threshold',
    title: 'Map: after uploaded launch, zipcode mapping renders nodes and keeps link counts stable across a threshold round-trip',
    tags: ['map', 'map-zipcode', 'map-threshold', 'load-to-map', 'snps'],
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
];
