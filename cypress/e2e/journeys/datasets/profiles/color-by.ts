import type { DatasetProfile } from '../types';
import { P } from '../types';

export const COLOR_BY_PROFILES: DatasetProfile[] = [
  P({
    id: 'color-by-uploaded-categorical',
    title: 'Styling: uploaded categorical node and link color-by controls update Cytoscape and color tables',
    tags: ['style', 'color-by', 'uploaded', 'node-link', 'load-to-twod', 'load-to-bubble'],
    files: [
      { name: 'TestStyleNodelist_snp.csv', datatype: 'node' },
      { name: 'TestStyleEdgelist_snp.csv', datatype: 'link', field1: 'source', field2: 'target' },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      afterLaunch: {
        nodes: 24,
        visibleLinks: 12,
        clusters: 5,
        singletons: 7,
      },
    },
  }),
];
