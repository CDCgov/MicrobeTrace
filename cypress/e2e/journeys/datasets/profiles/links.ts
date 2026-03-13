import type { DatasetProfile } from '../types';
import { P } from '../types';

export const LINK_PROFILES: DatasetProfile[] = [
  P({
    id: 'links-directed-arrows-uploaded',
    title: 'Links: uploaded directed and bidirectional edges render the correct arrow shapes',
    tags: ['links', 'link-arrows', 'directed', 'node-link', 'load-to-twod'],
    files: [
      { name: 'Cypress_DirectedNodes.csv', datatype: 'node' },
      {
        name: 'Cypress_DirectedLinks.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'None',
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
        visibleLinks: 2,
        clusters: 2,
        singletons: 0,
      },
    },
  }),
];
