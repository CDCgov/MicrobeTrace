/// <reference types="cypress" />

import {
  DATASET_PROFILES,
  hasExpectedDeviation,
  type DatasetProfile,
} from '../datasets/profile';
import {
  applyTwoDGroupingFromProfile,
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
  expandAccordionTabByHeader,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

(contractMode ? describe : describe.skip)('Journey Contracts - Intended Behavior', () => {
  const widthProfile = DATASET_PROFILES.find((profile) => profile.id === 'nn-angulartesting-tn93-edgelist');

  const openLinksPanel = (): void => {
    if (widthProfile === undefined) return;

    openTwoDSettingsDialog();

    cy.get('.p-dialog:visible').contains('.nav-link', 'Links').click({ force: true });
    cy.get('.tab-pane:visible').should('exist').as('linksTab');
    expandAccordionTabByHeader('@linksTab', 'Shapes and Sizes');
  };

  const clickReciprocalToggle = (index: number): void => {
    cy.get('@linksTab')
      .find('#link-width-reciprocal-non-reciprocal')
      .then(($toggle) => {
        cy.wrap($toggle.first().children().eq(index)).click({ force: true });
      });
  };

  const resolveWidthOrderingByDistance = (): Cypress.Chainable<'increasing' | 'decreasing'> => {
    return cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const rows: Array<{ distance: number; width: number }> = [];

      expect(cyInstance, 'cytoscapeInstance').to.exist;

      cyInstance.edges(':visible').forEach((edge: any) => {
        const distance = Number(edge.data('distance'));
        const width = parseFloat(String(edge.style('width')));

        if (!Number.isFinite(distance) || !Number.isFinite(width)) return;

        rows.push({ distance, width });
      });

      expect(rows.length, 'distance-derived link samples').to.be.greaterThan(2);

      const ordered = rows
        .filter((item) => Number.isFinite(item.distance) && Number.isFinite(item.width))
        .sort((a, b) => a.distance - b.distance);

      const uniqueDistances = ordered.filter((item, index, arr) =>
        index === 0 || item.distance !== arr[index - 1].distance
      );

      expect(uniqueDistances.length, 'unique distance-derived links').to.be.greaterThan(1);

      const smallest = uniqueDistances[0];
      const largest = uniqueDistances[uniqueDistances.length - 1];

      expect(smallest.width === largest.width, 'non-degenerate width mapping').to.equal(false);
      return smallest.width > largest.width ? 'decreasing' : 'increasing';
    });
  };

  const thresholdProfiles = DATASET_PROFILES.filter((profile: DatasetProfile) =>
    hasExpectedDeviation(profile.expectations.grouping?.thresholdChange?.expectedVisibleLinksAfter),
  );

  thresholdProfiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} applies the intended threshold behavior`, () => {
      const thresholdChange = profile.expectations.grouping?.thresholdChange;

      expect(thresholdChange, 'threshold change contract').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-threshold',
          kind: 'set-threshold',
          threshold: thresholdChange!.to,
        },
      ];
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);
      applyTwoDGroupingFromProfile(profile);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      cy.openGlobalSettings();
      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      setGlobalLinkThreshold(thresholdChange!.to);
      cy.closeGlobalSettings();

      getOracleSnapshot('oracleResult', 'after-threshold').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
    });
  });

  (contractMode && widthProfile ? it : it.skip)(
    `${widthProfile?.title ?? 'Unknown profile'} keeps reciprocal width orientation intended after toggle`,
    () => {
      launchProfileToTwoD(widthProfile!);
      openLinksPanel();

      cy.get('.tab-pane:visible')
        .find('#link-width-variable')
        .click({ force: true });

      cy.contains('li[role="option"]', 'Distance').click({ force: true });
      cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'distance');
      expandAccordionTabByHeader('.p-dialog:visible .tab-pane:visible', 'Shapes and Sizes');

      cy.window().its('commonService.session.style.widgets.link-width-reciprocal').then((initialReciprocal) => {
        resolveWidthOrderingByDistance().then((beforeOrdering) => {
          expect(
            beforeOrdering,
            `initial ordering when reciprocal is ${initialReciprocal ? 'on' : 'off'}`,
          ).to.equal(initialReciprocal ? 'decreasing' : 'increasing');
        });
      });

      clickReciprocalToggle(0);

      cy.window().its('commonService.session.style.widgets.link-width-reciprocal').should('equal', true);

      resolveWidthOrderingByDistance().then((afterReciprocalOrdering) => {
        expect(afterReciprocalOrdering, 'intended ordering when reciprocal is on').to.equal('decreasing');
      });

      clickReciprocalToggle(1);

      cy.window().its('commonService.session.style.widgets.link-width-reciprocal').should('equal', false);

      resolveWidthOrderingByDistance().then((afterNonReciprocalOrdering) => {
        expect(afterNonReciprocalOrdering, 'intended ordering when reciprocal is off').to.equal('increasing');
      });

    },
  );
});
