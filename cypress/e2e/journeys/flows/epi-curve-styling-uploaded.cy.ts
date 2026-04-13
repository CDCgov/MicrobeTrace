/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToEpiCurve,
  openEpiCurveSettingsDialog,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';
import {
  assertEpiCurveHasBars,
  readEpiCurveBars,
  selectEpiCurveDropdown,
  setEpiCurveLegendPosition,
} from '../../../support/epi-curve-helpers';

type WinWithMT = Window & {
  commonService: any;
};

const profile = getProfile('timeline-covid-node-link');
const changedThreshold = 22;
const fixedNodeColor = '#ff0000';

const getEpiSettingsDialog = (): Cypress.Chainable<JQuery<HTMLElement>> =>
  cy.get('.p-dialog:visible', { timeout: 10000 })
    .should(($dialogs) => {
      const dialog = $dialogs.toArray().find((candidate) =>
        Cypress.$(candidate)
          .find('.p-dialog-title')
          .toArray()
          .some((title) => String(title.textContent || '').trim() === 'Epi Curve Settings'));

      expect(dialog, 'visible Epi Curve Settings dialog').to.exist;
    })
    .then(($dialogs) => {
      const dialog = $dialogs.toArray().find((candidate) =>
        Cypress.$(candidate)
          .find('.p-dialog-title')
          .toArray()
          .some((title) => String(title.textContent || '').trim() === 'Epi Curve Settings'));

      return cy.wrap(dialog as HTMLElement);
    });

const ensureEpiSettingsDialogOpen = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleDialog =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Epi Curve Settings")').length > 0;

    if (hasVisibleDialog) return;
    openEpiCurveSettingsDialog();
  });

  getEpiSettingsDialog().should('be.visible');
};

const normalizeColor = (value: string): string => String(value || '')
  .replace(/\s+/g, '')
  .trim()
  .toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const colorMatchesHex = (value: string, hex: string): boolean => {
  const normalized = normalizeColor(value);
  return normalized === normalizeColor(hex) || normalized === normalizeColor(hexToRgbString(hex));
};

const readUniqueEpiCurveFills = (): Cypress.Chainable<string[]> =>
  readEpiCurveBars().then((bars) => [...new Set(
    bars
      .map((bar) => normalizeColor(bar.fill))
      .filter(Boolean),
  )].sort());

const selectVisiblePrimeOption = (selector: string, label: string): void => {
  const visibleOverlaySelector = '.p-select-overlay:visible, .p-connected-overlay:visible, .p-overlay:visible';

  cy.get(selector).click({ force: true });

  cy.get('body').then(($body) => {
    const overlay = $body.find(visibleOverlaySelector).last();
    expect(overlay.length, `visible overlay for ${selector}`).to.be.greaterThan(0);

    const option = overlay
      .find('li[role="option"]')
      .toArray()
      .find((candidate) => String(candidate.textContent || '').trim() === label);

    expect(option, `visible option "${label}" for ${selector}`).to.exist;

    cy.wrap(option as HTMLElement)
      .scrollIntoView()
      .click({ force: true });
  });
};

const ensureNodeColorTableVisible = (): void => {
  cy.get('#node-color-table-row', { timeout: 15000 }).should('be.visible');

  cy.get('body').then(($body) => {
    const hasVisibleTable =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Node Color Table")').length > 0;

    if (hasVisibleTable) return;

    cy.get('#node-color-table-row')
      .contains('.p-selectbutton .p-togglebutton-label', 'Show')
      .click({ force: true });
  });

  cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
  cy.get('#node-color-table tr', { timeout: 15000 }).should(($rows) => {
    expect($rows.length, 'node color table rows').to.be.greaterThan(1);
  });
};

const closeDialogIfVisible = (dialogTitle: string): void => {
  cy.get('body').then(($body) => {
    const hasVisibleDialog =
      $body.find(`.p-dialog:visible .p-dialog-title:contains("${dialogTitle}")`).length > 0;

    if (hasVisibleDialog) {
      cy.closeSettingsPane(dialogTitle);
    }
  });
};

const closeGlobalSettingsIfVisible = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleGlobalSettings =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Global Settings")').length > 0;

    if (hasVisibleGlobalSettings) {
      cy.closeGlobalSettings();
    }
  });
};

const switchGlobalSettingsTab = (label: 'Filtering' | 'Styling'): void => {
  cy.contains('#global-settings-modal .nav-link', label, { timeout: 15000 }).click({ force: true });
};

describe('Journey Flow - Epi Curve styling on uploaded data', () => {
  beforeEach(() => {
    launchProfileToEpiCurve(profile);
    assertAfterLaunchCounts(profile);
    openEpiCurveSettingsDialog();
    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    assertEpiCurveHasBars();
    ensureEpiSettingsDialogOpen();
  });

  afterEach(() => {
    closeDialogIfVisible('Node Color Table');
    closeDialogIfVisible('Epi Curve Settings');
    closeGlobalSettingsIfVisible();
  });

  it('recomputes uploaded Epi cluster colors when filtering threshold changes', () => {
    let initialClusterCount = 0;
    let initialLegendCount = 0;
    let initialFills: string[] = [];

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'Cluster');
    setEpiCurveLegendPosition('Right');
    closeDialogIfVisible('Epi Curve Settings');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      initialClusterCount = Number(typedWindow.commonService.session.data.clusters.length);
      expect(initialClusterCount, 'initial cluster count').to.be.greaterThan(0);
    });

    cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
      .its('length')
      .then((count) => {
        initialLegendCount = Number(count);
        expect(initialLegendCount, 'initial legend item count').to.be.greaterThan(0);
      });

    readUniqueEpiCurveFills().then((fills) => {
      initialFills = fills;
      expect(fills.length, 'initial cluster fill count').to.be.greaterThan(1);
    });

    cy.openGlobalSettings();
    switchGlobalSettingsTab('Filtering');
    setGlobalLinkThreshold(changedThreshold);

    cy.window()
      .its('commonService.session.data.clusters.length')
      .should((clusterCount) => {
        expect(Number(clusterCount), 'cluster count after threshold change').not.to.equal(initialClusterCount);
      });

    cy.window()
      .its('commonService.session.data.clusters.length')
      .then((clusterCount) => {
        const nextClusterCount = Number(clusterCount);
        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .should('have.length', nextClusterCount)
          .its('length')
          .should('not.equal', initialLegendCount);
      });

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills.length, 'cluster fill count after threshold change').to.be.greaterThan(1);
      expect(fills, 'cluster color set after threshold change').not.to.deep.equal(initialFills);
    });
  });

  it('recomputes uploaded Epi node-color fills when cluster colors change', () => {
    const updatedColor = '#123456';
    let initialClusterCount = 0;
    let fillsBeforeThreshold: string[] = [];
    let fillsBeforeColorEdit: string[] = [];
    let initialFirstRowColor = '';

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'Node Color');
    setEpiCurveLegendPosition('Right');
    closeDialogIfVisible('Epi Curve Settings');

    cy.openGlobalSettings();
    switchGlobalSettingsTab('Styling');
    selectVisiblePrimeOption('#node-color-variable', 'Cluster');

    cy.window()
      .its('commonService.session.style.widgets.node-color-variable')
      .should('equal', 'cluster');

    ensureNodeColorTableVisible();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      initialClusterCount = Number(typedWindow.commonService.session.data.clusters.length);
      expect(initialClusterCount, 'initial cluster count for node-color path').to.be.greaterThan(0);
    });

    readUniqueEpiCurveFills().then((fills) => {
      fillsBeforeThreshold = fills;
      expect(fills.length, 'initial node-color fill count').to.be.greaterThan(1);
    });

    switchGlobalSettingsTab('Filtering');
    setGlobalLinkThreshold(changedThreshold);

    cy.window()
      .its('commonService.session.data.clusters.length')
      .should((clusterCount) => {
        expect(
          Number(clusterCount),
          'cluster count after threshold change in node-color mode',
        ).not.to.equal(initialClusterCount);
      });

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills.length, 'node-color fill count after threshold change').to.be.greaterThan(1);
      expect(fills, 'node-color fill set after threshold change').not.to.deep.equal(fillsBeforeThreshold);
    });

    switchGlobalSettingsTab('Styling');
    ensureNodeColorTableVisible();

    readUniqueEpiCurveFills().then((fills) => {
      fillsBeforeColorEdit = fills;
    });

    cy.get('#node-color-table tr', { timeout: 15000 })
      .eq(1)
      .find('input[type="color"]')
      .should('have.length', 1)
      .then(($input) => {
        initialFirstRowColor = String($input.val() || '');

        const input = $input.get(0) as HTMLInputElement;
        input.value = updatedColor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

    cy.get('#node-color-table tr')
      .eq(1)
      .find('input[type="color"]')
      .should('have.value', updatedColor);

    readUniqueEpiCurveFills().then((fills) => {
      expect(
        fills.some((fill) => colorMatchesHex(fill, updatedColor)),
        'updated node-color table color appears in the rendered Epi bars',
      ).to.equal(true);

      if (fillsBeforeColorEdit.some((fill) => colorMatchesHex(fill, initialFirstRowColor))) {
        expect(
          fills.some((fill) => colorMatchesHex(fill, initialFirstRowColor)),
          'previous node-color table color is removed from the rendered Epi bars',
        ).to.equal(false);
      }
    });

    selectVisiblePrimeOption('#node-color-variable', 'None');

    cy.window()
      .its('commonService.session.style.widgets.node-color-variable')
      .should((nodeColorVariable) => {
        expect(String(nodeColorVariable || '').trim().toLowerCase()).to.equal('none');
      });

    cy.get('#node-color')
      .should('be.visible')
      .invoke('val', fixedNodeColor)
      .trigger('input')
      .trigger('change');

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills, 'fixed node-color fill set').to.have.length(1);
      expect(
        fills.every((fill) => colorMatchesHex(fill, fixedNodeColor)),
        'fixed node-color should collapse the rendered Epi bars to one configured fill',
      ).to.equal(true);
    });
  });
});
