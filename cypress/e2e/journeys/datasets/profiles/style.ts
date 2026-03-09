// cypress/e2e/journeys/datasets/profiles/style.ts
import type { DatasetProfile } from '../types';
import { P } from '../types';

export const STYLE_PROFILES: DatasetProfile[] = [
  P({
    id: 'style-apply-cypress-test-style',
    title: 'Apply Style: nodes colored by profession, shaped by NodeType, sized by degree; links colored by contact type',
    tags: ['style', 'apply-style', 'load-to-twod'],
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
      applyStyle: {
        styleFile: 'Cypress_Test_Style.style',
        expectWidgets: {
          nodeColorVariable: 'Profession',
          nodeSymbolVariable: 'Node type',
          nodeRadiusVariable: 'degree',
          linkColorVariable: 'Contact type',
        },
        expectTables: {
          nodeColorTable: true,
          nodeSymbolTable: true,
          linkColorTable: true,
          nodeSizeTable: false,
        },
      },
    },
  }),
];
