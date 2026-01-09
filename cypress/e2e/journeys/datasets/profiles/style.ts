// cypress/e2e/journeys/datasets/profiles/style.ts
import type { DatasetProfile } from '../types';
import { P } from '../types';

export const STYLE_PROFILES: DatasetProfile[] = [
  P({
    id: 'style-apply-cypress-test-style',
    title: 'Apply Style: nodes colored by profession, shaped by NodeType, sized by degree; links colored by contact type',
    tags: ['style', 'apply-style'],
    files: [
      { name: 'TestStyleNodelist_snp.csv', datatype: 'node' },
      { name: 'TestStyleEdgelist_snp.csv', datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
    ],
    preLaunch: {
      metric: 'snps',
      threshold: 16,
      defaultView: '2D Network',
    },
    expectations: {
      applyStyle: {
        styleFile: 'Cypress_Test_Style.style',
        expectWidgets: {
          nodeColorVariable: 'profession',
          nodeSymbolVariable: 'NodeType',
          nodeRadiusVariable: 'degree',
          linkColorVariable: 'Contact',
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
