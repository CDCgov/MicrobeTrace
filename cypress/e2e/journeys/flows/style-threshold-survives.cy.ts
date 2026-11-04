/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertMetricCount,
  assertStyleTablesFromProfile,
  assertStyleWidgetsFromProfile,
  assertVisibleStylePreserved,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  snapshotVisibleStyles,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';

describe('Journey Flow - Style survives threshold filtering', () => {
  const profile = getProfile('style-apply-cypress-test-style-threshold');
  const filteredThreshold = 0.1;
  const expectedVisibleLinksAfterThreshold = 7;

  const applyStyleWithImportedFilter = (): void => {
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });
    cy.fixture('Cypress_Test_Style.style', 'utf8').then((contents) => {
      const style = JSON.parse(String(contents));
      Object.assign(style.widgets, {
        'default-distance-metric': 'tn93',
        'link-sort-variable': 'distance',
        'link-threshold': filteredThreshold,
      });

      cy.get('#apply-style').selectFile({
        contents: Cypress.Buffer.from(JSON.stringify(style)),
        fileName: 'imported-filter.style',
        mimeType: 'application/json',
      }, { force: true });
    });
  };

  const assertDegreeSizingStillFollowsVisibleDegrees = (): void => {
    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const rankedByDegree = cyInstance
        .nodes()
        .filter((node: any) => !node.hasClass('parent') && node.visible())
        .map((node: any) => ({
          id: String(node.id()),
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      expect(rankedByDegree.length, 'visible nodes available for degree sizing').to.be.greaterThan(1);

      const smallest = rankedByDegree[0];
      const largest = rankedByDegree[rankedByDegree.length - 1];
      const widgets = win.commonService.session.style.widgets;
      const mapNodeSize = (size: number): number => size / 100 * 40 + 10;
      const expectedMinimumWidth = mapNodeSize(Number(widgets['node-radius-min']));
      const expectedMaximumWidth = mapNodeSize(Number(widgets['node-radius-max']));

      expect(largest.degree, 'visible degree range after threshold').to.be.greaterThan(smallest.degree);
      expect(largest.width, 'higher visible degree still renders larger after threshold').to.be.greaterThan(smallest.width);
      expect(smallest.width, 'minimum visible degree uses configured minimum size')
        .to.be.closeTo(expectedMinimumWidth, 1);
      expect(largest.width, 'maximum visible degree uses configured maximum size')
        .to.be.closeTo(expectedMaximumWidth, 1);
    });
  };

  it('preserves rendered style mappings after the visible link set changes', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().as('preThresholdStyles');

    openGlobalFilteringTab();
    setGlobalLinkThreshold(filteredThreshold);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfVisibleLinks', expectedVisibleLinksAfterThreshold);
    assertStyleWidgetsFromProfile(profile);
    assertStyleTablesFromProfile(profile);
    assertDegreeSizingStillFollowsVisibleDegrees();

    snapshotVisibleStyles().then((afterThreshold) => {
      expect(Object.keys(afterThreshold.edges), 'visible styled edges after threshold').to.have.length(expectedVisibleLinksAfterThreshold);

      cy.get<StyleSnapshot>('@preThresholdStyles').then((before) => {
        assertVisibleStylePreserved(before, afterThreshold, { ignoreNodeWidths: true });
      });
    });
  });

  it('applies an imported metric, link field, and threshold to the active network', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleWithImportedFilter();
    waitForProcessingDialogToClear();

    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const microbeTrace = win.commonService.visuals.microbeTrace;
      const globalSettings = win.commonService.GlobalSettingsModel;

      expect(widgets['default-distance-metric']).to.equal('tn93');
      expect(widgets['link-sort-variable']).to.equal('distance');
      expect(widgets['link-threshold']).to.equal(filteredThreshold);
      expect(microbeTrace.SelectedDistanceMetricVariable).to.equal('tn93');
      expect(microbeTrace.SelectedLinkSortVariable).to.equal('distance');
      expect(microbeTrace.SelectedLinkThresholdVariable).to.equal(filteredThreshold);
      expect(globalSettings.SelectedDistanceMetricVariable).to.equal('tn93');
      expect(globalSettings.SelectedLinkSortVariable).to.equal('distance');
      expect(globalSettings.SelectedLinkThresholdVariable).to.equal(filteredThreshold);
    });

    cy.closeGlobalSettings();
    assertMetricCount('#numberOfVisibleLinks', expectedVisibleLinksAfterThreshold);
  });
});
