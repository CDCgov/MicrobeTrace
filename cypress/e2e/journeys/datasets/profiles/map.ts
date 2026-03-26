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
  P({
    id: 'map-angulartesting-lat-long',
    title: 'Map: uploaded latitude and longitude fields render nodes at exact coordinates',
    tags: ['map', 'map-lat-long', 'load-to-map', 'tn93'],
    files: [
      {
        name: 'AngularTesting_nodes_Map.csv',
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
        nodes: 4,
        visibleLinks: 4,
        clusters: 1,
        singletons: 0,
      },
    },
  }),
  P({
    id: 'map-color-by-uploaded',
    title: 'Map: uploaded node and link color mappings update Leaflet rendering and color tables',
    tags: ['map', 'map-color', 'style', 'load-to-map'],
    files: [
      {
        name: 'Cypress_MapColorNodes.csv',
        datatype: 'node',
        field1: 'ID',
      },
      {
        name: 'Cypress_MapColorLinks.csv',
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
        visibleLinks: 4,
        clusters: 1,
        singletons: 0,
      },
    },
  }),
];
