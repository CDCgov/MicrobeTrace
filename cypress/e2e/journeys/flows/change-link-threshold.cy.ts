/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyTwoDGroupingFromProfile,
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - Change Link Threshold', () => {
  const profile = getProfile('grouping-tn93-polygons-subtype');

  it(profile.title, () => {
    const thresholdChange = profile.expectations.grouping?.thresholdChange;
    expect(thresholdChange, 'threshold change expectation').to.exist;
    const initialThreshold = thresholdChange!.from;
    const loweredThreshold = thresholdChange!.to;

    const oracleSteps: OracleStep[] = [
      {
        id: 'after-threshold',
        kind: 'set-threshold',
        threshold: loweredThreshold,
      },
    ];
    computeOracleForProfile(profile, oracleSteps);

    launchProfileToTwoD(profile);
    applyTwoDGroupingFromProfile(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const initialParents = cyInstance.nodes('.parent').map((node: any) => node.id()).sort();
      cy.wrap(initialParents, { log: false }).as('initialParentIds');
    });

    const assertGroupingParentsUnchanged = (): void => {
      if (!thresholdChange!.expectPolygonsUnchanged) return;

      cy.get('@initialParentIds').then((initialParentIds) => {
        cy.window().then((win: any) => {
          const cyInstance = win.cytoscapeInstance;
          const currentParentIds = cyInstance.nodes('.parent').map((node: any) => node.id()).sort();
          expect(currentParentIds).to.deep.equal(initialParentIds);
        });
      });
    };

    const assertInitialThresholdState = (): void => {
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
      assertGroupingParentsUnchanged();
    };

    const assertLoweredThresholdState = (): void => {
      getOracleSnapshot('oracleResult', 'after-threshold').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
      assertGroupingParentsUnchanged();
    };

    assertInitialThresholdState();

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click();

    setGlobalLinkThreshold(loweredThreshold);
    assertLoweredThresholdState();

    setGlobalLinkThreshold(initialThreshold);
    assertInitialThresholdState();

    setGlobalLinkThreshold(loweredThreshold);
    assertLoweredThresholdState();

    setGlobalLinkThreshold(initialThreshold);
    assertInitialThresholdState();

    cy.closeGlobalSettings();
  });
});
