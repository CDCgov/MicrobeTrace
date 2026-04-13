/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToSankeyView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  addSankeyFields,
  aliasSankeySelection,
  assertRenderedSankey,
} from '../../../support/sankey-ui-helpers';

const profile = {
  ...getProfile('load-large-node-link-smoke'),
  files: [
    { name: 'LargeDataSet_Test_sequences_node_sankey.csv', datatype: 'node' },
    { name: 'Large_Dataset_forTesting_epiLinks.csv', datatype: 'link', field1: 'ID1', field2: 'ID2' },
  ],
} as DatasetProfile;

describe('Journey Flow - Sankey large uploaded smoke', () => {
  it('opens Sankey on the large uploaded network and renders a stable subtype-to-month graph', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToSankeyView();

    aliasSankeySelection('largeSankeySelection', {
      explicitFields: ['subtype', 'Diag month'],
    });
    addSankeyFields('@largeSankeySelection');
    assertRenderedSankey('@largeSankeySelection', 60000);
  });
});
