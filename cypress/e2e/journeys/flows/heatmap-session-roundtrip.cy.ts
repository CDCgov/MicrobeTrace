/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertHeatmapReady,
  assertHeatmapMatchesBackingMatrix,
  launchProfileToHeatmap,
  openHeatmapSettingsDialog,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type HeatmapAccordionPanel = 'heatmap-invert' | 'heatmap-labels' | 'heatmap-color';

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

const setColorInput = (inputSelector: string, color: string): void => {
  cy.get('@heatmapSettings').find(inputSelector).then(($input) => {
    const input = $input.get(0) as HTMLInputElement;
    input.value = color;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const ensureHeatmapViewAfterReload = (): void => {
  cy.get('body', { timeout: 15000 }).then(($body) => {
    if ($body.find('#heatmap svg.main-svg:visible').length) {
      assertHeatmapReady(60000);
      return;
    }

    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Heatmap', { timeout: 15000 }).click({ force: true });
    assertHeatmapReady(60000);
  });
};

describe('Journey Flow - Heatmap session round-trip', () => {
  const profile = getProfile('heatmap-tn93-matrix');
  const colors = {
    low: '#102a43',
    medium: '#f0b429',
    high: '#d64545',
  };

  it('restores Heatmap widget state after saving and reloading a session', () => {
    const sessionFileBase = `cypress_heatmap_session_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToHeatmap(profile);

    openHeatmapSettingsDialog();

    openHeatmapAccordion('heatmap-invert');
    setSelectButtonValue('#x-invert', 'Yes');
    setSelectButtonValue('#y-invert', 'Yes');

    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');

    openHeatmapAccordion('heatmap-color');
    setColorInput('#low-color', colors.low);
    setColorInput('#med-color', colors.medium);
    setColorInput('#hi-color', colors.high);

    cy.closeSettingsPane('Heatmap Settings');

    assertHeatmapMatchesBackingMatrix({
      invertX: true,
      invertY: true,
      labelsVisible: true,
      metric: profile.preLaunch.metric,
      colors,
    });

    saveSessionFromFileMenu(sessionFileBase);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved .microbetrace content').to.include('"session"');
      expect(savedSession.length, 'saved .microbetrace length').to.be.greaterThan(100);
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(30000);
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    cy.get('#cy, #heatmap', { timeout: 60000 }).should('exist');
    ensureHeatmapViewAfterReload();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['heatmap-invertX']).to.equal(true);
        expect(widgets['heatmap-invertY']).to.equal(true);
        expect(widgets['heatmap-axislabels-show']).to.equal(true);
        expect(widgets['heatmap-color-low']).to.equal(colors.low);
        expect(widgets['heatmap-color-medium']).to.equal(colors.medium);
        expect(widgets['heatmap-color-high']).to.equal(colors.high);
      });

    assertHeatmapMatchesBackingMatrix({
      invertX: true,
      invertY: true,
      labelsVisible: true,
      metric: profile.preLaunch.metric,
      colors,
    });
  });
});
