/// <reference types="cypress" />

import {
  assertHeatmapMatchesBackingMatrix,
  launchProfileToHeatmap,
  openGlobalStylingTab,
  openHeatmapSettingsDialog,
} from '../../../support/journey-helpers';
import { getProfile } from '../datasets/profile';

type HeatmapAccordionPanel = 'heatmap-labels';

const hexToRgb = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgb(${r}, ${g}, ${b})`;
};

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

const setColorInputValue = (selector: string, value: string): void => {
  cy.get(selector).then(($input) => {
    const el = $input.get(0) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Journey Flow - Heatmap global background styling', () => {
  const profile = getProfile('heatmap-tn93-matrix');
  const backgroundColor = '#1a2b3c';
  const expectedContrast = '#ffffff';

  it('restyles an active Heatmap background and axis text from global styling', () => {
    launchProfileToHeatmap(profile);

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    cy.closeSettingsPane('Heatmap Settings');

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: true,
    });

    openGlobalStylingTab();
    setColorInputValue('#background-color', backgroundColor);

    cy.window()
      .its('commonService.session.style.widgets.background-color')
      .should('equal', backgroundColor);
    cy.window()
      .its('commonService.session.style.widgets.background-color-contrast')
      .should('equal', expectedContrast);

    cy.get('#heatmap svg.main-svg')
      .first()
      .should('have.css', 'background-color', hexToRgb(backgroundColor));
    cy.get('#heatmap .xaxislayer-above text')
      .first()
      .should('have.css', 'fill', hexToRgb(expectedContrast));
    cy.get('#heatmap .yaxislayer-above text')
      .first()
      .should('have.css', 'fill', hexToRgb(expectedContrast));

    cy.closeGlobalSettings();

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: true,
    });
  });
});
