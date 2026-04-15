/// <reference types="cypress" />

import {
  assertHeatmapMatchesBackingMatrix,
  assertHeatmapReady,
  assertMetricCount,
  goToHeatmapView,
  openHeatmapSettingsDialog,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

type HeatmapAccordionPanel = 'heatmap-labels';

const openHeatmapAccordion = (panelValue: HeatmapAccordionPanel): void => {
  cy.get('@heatmapSettings')
    .find(`p-accordion-panel[value="${panelValue}"] .p-accordionheader`)
    .first()
    .then(($header) => {
      if ($header.attr('aria-expanded') !== 'true') {
        cy.wrap($header).click({ force: true });
      }
    });
};

const setSelectButtonValue = (controlSelector: string, value: 'Yes' | 'No'): void => {
  const targetIndex = value === 'Yes' ? 0 : 1;

  cy.get('@heatmapSettings')
    .find(controlSelector)
    .find('p-togglebutton')
    .eq(targetIndex)
    .click({ force: true });
};

const openHeatmapExportDialog = (): void => {
  cy.get('heatmapcomponent #tool-btn-container a[title="Export Screen"]:visible', { timeout: 30000 })
    .click({ force: true });

  cy.contains('.p-dialog-title', 'Export Heatmap', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('heatmapExportDialog');
};

describe('Heatmap View', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);
    goToHeatmapView();
    assertHeatmapReady();
  });

  it('renders the sample dataset and keeps settings/export interactions responsive', () => {
    assertMetricCount('#numberOfNodes', 33, 60000);
    assertMetricCount('#numberOfVisibleLinks', 74, 60000);
    assertHeatmapMatchesBackingMatrix({
      labelsVisible: false,
    });

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    cy.closeSettingsPane('Heatmap Settings');

    cy.window()
      .its('commonService.session.style.widgets.heatmap-axislabels-show')
      .should('equal', true);

    assertHeatmapMatchesBackingMatrix({
      labelsVisible: true,
    });

    openHeatmapExportDialog();
    cy.closeSettingsPane('Export Heatmap');
  });
});
