/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAggregateTableCount,
  assertAggregateTableMatchesModel,
} from '../../../support/aggregate-helpers';
import {
  assertAfterLaunchCounts,
  assertAggregateReady,
  goToAggregateView,
  launchProfileToTwoD,
  openAggregateExportDialog,
} from '../../../support/journey-helpers';

describe('Journey Flow - Aggregate large uploaded smoke', () => {
  const profile = getProfile('load-large-node-link-smoke');

  it('opens Aggregate on the large uploaded network and keeps export reachable', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToAggregateView();
    assertAggregateReady(60000);

    assertAggregateTableCount(1);
    assertAggregateTableMatchesModel(0, 'Node-cluster');

    openAggregateExportDialog();
    cy.closeSettingsPane('Aggregate Export');
  });
});
