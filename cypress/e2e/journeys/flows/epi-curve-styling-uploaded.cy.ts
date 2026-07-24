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
const styleProfile = getProfile('color-by-uploaded-categorical');
const changedThreshold = 22;
const fixedNodeColor = '#ff0000';
const epiLineageBlue = '#3998f5';
const editedColoradoColor = '#000000';
const targetLineage = 'B.1.617.2';

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

const getApp = (win: WinWithMT) => {
  const app = win.commonService?.visuals?.microbeTrace;

  expect(app, 'microbeTrace host app').to.exist;
  expect(app?._goldenLayoutHostComponent, 'golden layout host').to.exist;

  return app;
};

const focusAppTab = (tabLabel: string): void => {
  cy.window().then((win: unknown) => {
    const app = getApp(win as WinWithMT);
    const tabIndex = app.homepageTabs.findIndex((tab: any) => tab.label === tabLabel);

    expect(tabIndex, `tab index for ${tabLabel}`).to.be.greaterThan(-1);

    app._goldenLayoutHostComponent.focusComponent(tabLabel);
    app.setActiveTabProperties(tabIndex);
  });

  cy.wait(50, { log: false });
  cy.window().its('commonService.activeTab').should('equal', tabLabel);
};

const getDockedNodeColorCard = (): Cypress.Chainable<JQuery<HTMLElement>> =>
  cy.contains('.key-table-card__header h5', 'Node Colors', { timeout: 15000 })
    .parents('.key-table-card')
    .first();

const floatDockedNodeColorTable = (): void => {
  getDockedNodeColorCard()
    .find('button[title="Float table"]')
    .click({ force: true });
};

const changeColorTableEntry = (tableSelector: string, value: string, nextColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = nextColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(`${tableSelector} td[data-value="${value}"]`)
    .closest('tr')
    .find('input[type="color"]')
    .should('have.value', nextColor);
};

const assertColorTableEntryColor = (tableSelector: string, value: string, expectedColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should(($input) => {
      expect(
        colorMatchesHex(String($input.val() || ''), expectedColor),
        `${value} color table value`,
      ).to.equal(true);
    });
};

const assertEpiLegendItemColor = (label: string, expectedColor: string): void => {
  cy.get('#epiCurveSVG .epiCurve-epi-curve text', { timeout: 15000 })
    .should(($texts) => {
      const text = $texts
        .toArray()
        .find((candidate) => String(candidate.textContent || '').trim() === label);

      expect(text, `Epi legend label ${label}`).to.exist;

      const marker = text?.previousElementSibling as SVGElement | null;

      expect(String(marker?.tagName || '').toLowerCase(), `Epi legend marker for ${label}`).to.equal('circle');

      const fill = String(marker?.style?.fill || marker?.getAttribute('fill') || Cypress.$(marker as Element).css('fill') || '');

      expect(colorMatchesHex(fill, expectedColor), `Epi legend color for ${label}`).to.equal(true);
    });
};

const assertLineageEpiColorStillBlue = (): void => {
  assertEpiLegendItemColor(targetLineage, epiLineageBlue);

  readUniqueEpiCurveFills().should((fills) => {
    expect(
      fills.some((fill) => colorMatchesHex(fill, epiLineageBlue)),
      `${targetLineage} blue appears in rendered Epi bars`,
    ).to.equal(true);
    expect(
      fills.some((fill) => colorMatchesHex(fill, editedColoradoColor)),
      'global State table black does not bleed into rendered Epi bars',
    ).to.equal(false);
  });
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
    let editedClusterKey = '';

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
    cy.get('#node-color-table-row')
      .scrollIntoView()
      .should('be.visible');

    readUniqueEpiCurveFills().then((fills) => {
      fillsBeforeColorEdit = fills;
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const commonService = typedWindow.commonService;
      const clusterKeys = commonService.session.style.nodeColorsTableKeys?.cluster || [];

      expect(clusterKeys.length, 'cluster keys available for node-color mapping').to.be.greaterThan(0);

      editedClusterKey = String(clusterKeys[0]);
      initialFirstRowColor = String(
        commonService.session.style.nodeColorsTableHistory?.cluster?.[editedClusterKey]
        || commonService.temp.style.nodeColorMap?.(editedClusterKey)
        || '',
      );

      expect(initialFirstRowColor, 'initial cluster color before edit').not.to.equal('');
    });

    cy.then(() => {
      changeColorTableEntry('#key-tables-node-table', editedClusterKey, updatedColor);
    });

    cy.window()
      .its('commonService.session.style.nodeColorsTableHistory.cluster')
      .should((history) => {
        expect(String(history?.[editedClusterKey] || '').toLowerCase(), `updated stored color for ${editedClusterKey}`)
          .to.equal(updatedColor);
      });

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

describe('Journey Flow - Epi Curve color table isolation on uploaded style data', () => {
  beforeEach(() => {
    launchProfileToEpiCurve(styleProfile);
    assertAfterLaunchCounts(styleProfile);
    openEpiCurveSettingsDialog();
    selectEpiCurveDropdown('Date Field', 'CollectionDate');
    assertEpiCurveHasBars();
    ensureEpiSettingsDialogOpen();
  });

  afterEach(() => {
    closeDialogIfVisible('Node Color Table');
    closeDialogIfVisible('Epi Curve Settings');
    closeGlobalSettingsIfVisible();
  });

  it('keeps Lineage-colored Epi bars isolated when the global State color table changes and floats', () => {
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'Lineage');
    setEpiCurveLegendPosition('Right');

    cy.window()
      .its('commonService.session.style.widgets.epiCurve-stackColorBy')
      .should('equal', 'Lineage');
    assertLineageEpiColorStillBlue();

    closeDialogIfVisible('Epi Curve Settings');

    cy.openGlobalSettings();
    switchGlobalSettingsTab('Styling');
    selectVisiblePrimeOption('#node-color-variable', 'State');

    cy.window()
      .its('commonService.session.style.widgets.node-color-variable')
      .should('equal', 'State');

    closeGlobalSettingsIfVisible();

    focusAppTab('Docked Key Tables');
    cy.get('#key-tables-node-table td[data-value="Colorado"]', { timeout: 15000 })
      .should('exist');
    changeColorTableEntry('#key-tables-node-table', 'Colorado', editedColoradoColor);

    focusAppTab('Epi Curve');
    cy.get('#epiCurveSVG', { timeout: 15000 }).should('be.visible');
    assertLineageEpiColorStillBlue();

    focusAppTab('Docked Key Tables');
    floatDockedNodeColorTable();
    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#node-color-table', { timeout: 15000 }).should('be.visible');
    assertColorTableEntryColor('#node-color-table', 'Colorado', editedColoradoColor);

    focusAppTab('Epi Curve');
    cy.get('#epiCurveSVG', { timeout: 15000 }).should('be.visible');
    assertLineageEpiColorStillBlue();
  });
});
