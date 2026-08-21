/// <reference types="cypress" />

import {
  assertHeatmapMatchesBackingMatrix,
  assertHeatmapReady,
  assertMetricCount,
  goToHeatmapView,
  openGlobalFilteringTab,
  openHeatmapSettingsDialog,
  setGlobalDistanceMetric,
  setTN93DistanceDisplayFormat,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

type HeatmapAccordionPanel = 'heatmap-labels';
type HeatmapColorbarSnapshot = {
  tickvals: number[];
  ticktext: string[];
};
type WinWithMT = Window & {
  commonService: any;
};

const openHeatmapAccordion = (panelValue: HeatmapAccordionPanel): void => {
  cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click({ force: true });
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

const readHeatmapColorbar = (): Cypress.Chainable<HeatmapColorbarSnapshot> => {
  return cy.window().then((win: unknown) => {
    const trace = (win as WinWithMT).commonService.visuals.heatmap.heatmapData?.[0];
    const colorbar = trace?.colorbar || {};

    return {
      tickvals: [...(colorbar.tickvals || [])],
      ticktext: [...(colorbar.ticktext || [])],
    };
  });
};

const assertHeatmapColorbarFormat = (expectedPercentageFormat: boolean): void => {
  cy.window({ timeout: 20000 }).should((win: unknown) => {
    const trace = (win as WinWithMT).commonService.visuals.heatmap.heatmapData?.[0];
    const colorbar = trace?.colorbar || {};
    const tickvals = colorbar.tickvals || [];
    const ticktext = colorbar.ticktext || [];

    expect(colorbar.tickmode, 'heatmap colorbar tick mode').to.equal('array');
    expect(tickvals.length, 'heatmap colorbar tick count').to.be.greaterThan(3);
    expect(ticktext.length, 'heatmap colorbar label count').to.equal(tickvals.length);
    expect(ticktext.some((label: string) => label.includes('%')), 'heatmap colorbar percentage labels')
      .to.equal(expectedPercentageFormat);
  });
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

  it('keeps colorbar ticks stable when switching TN93 distance display format', () => {
    openGlobalFilteringTab();
    setGlobalDistanceMetric('tn93');
    cy.contains('.p-dialog-title', 'Global Settings')
      .parents('.p-dialog')
      .find('#tn93-distance-display-format')
      .should('be.visible');
    setTN93DistanceDisplayFormat('decimal');
    cy.closeGlobalSettings();

    assertHeatmapColorbarFormat(false);
    readHeatmapColorbar().then((decimalColorbar) => {
      openGlobalFilteringTab();
      setTN93DistanceDisplayFormat('percentage');
      cy.closeGlobalSettings();

      assertHeatmapColorbarFormat(true);
      readHeatmapColorbar().then((percentageColorbar) => {
        expect(percentageColorbar.tickvals, 'percentage tick positions').to.deep.equal(decimalColorbar.tickvals);
        expect(percentageColorbar.ticktext, 'percentage tick labels').to.not.deep.equal(decimalColorbar.ticktext);
      });

      openGlobalFilteringTab();
      setTN93DistanceDisplayFormat('decimal');
      cy.closeGlobalSettings();

      assertHeatmapColorbarFormat(false);
      readHeatmapColorbar().then((resetColorbar) => {
        expect(resetColorbar.tickvals, 'restored decimal tick positions').to.deep.equal(decimalColorbar.tickvals);
        expect(resetColorbar.ticktext, 'restored decimal tick labels').to.deep.equal(decimalColorbar.ticktext);
      });
    });
  });
});
