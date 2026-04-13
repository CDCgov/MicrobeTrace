/// <reference types="cypress" />

import {
  buildExpectedCrosstabModel,
  chooseCrosstabFields,
  assertRenderedCrosstabMatches,
  selectCrosstabField,
} from '../../support/crosstab-helpers';
import {
  goToCrosstabView,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

type WinWithMT = Window & {
  commonService: any;
  context?: {
    commonService: any;
  };
};

const getChosenFields = (): Cypress.Chainable<{ xField: string; yField: string }> => {
  return cy.window().then((rawWin: unknown) => chooseCrosstabFields(rawWin as WinWithMT));
};

const configureChosenFields = (): Cypress.Chainable<{ xField: string; yField: string }> => {
  return getChosenFields().then(({ xField, yField }) => {
    selectCrosstabField('@crosstabSettings', 'crosstab-x-variable', xField, 'crosstab-xVariable');
    selectCrosstabField('@crosstabSettings', 'crosstab-y-variable', yField, 'crosstab-yVariable');
    return cy.wrap({ xField, yField }, { log: false });
  });
};

const ensureWindowContext = (win: WinWithMT): void => {
  win.context = win.context || { commonService: win.commonService };
  win.context.commonService = win.commonService;
};

describe('Crosstab View', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    goToCrosstabView();

    cy.contains('.p-dialog-title', 'Crosstab Settings', { timeout: 10000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('crosstabSettings');
  });

  it('defaults to cluster vs None on first open and renders the single-axis title branch', () => {
    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const crossTab = win.commonService.visuals.crossTab;

      expect(crossTab.xVariable, 'default x field').to.equal('cluster');
      expect(crossTab.yVariable, 'default y field').to.equal('None');
      expect(win.commonService.session.style.widgets['crosstab-useProportion'], 'default show mode').to.equal(false);

      const expected = buildExpectedCrosstabModel(win, 'cluster', 'None', false);
      assertRenderedCrosstabMatches(expected);
      expect(expected.title, 'default single-axis title').to.equal('Cluster');
    });
  });

  it('renders the sample-data crosstab with deterministic totals for the chosen axes', () => {
    configureChosenFields().then(({ xField, yField }) => {
      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, xField, yField, false);
        assertRenderedCrosstabMatches(expected);
      });
    });
  });

  it('supports the y-only and both-None title branches without breaking totals', () => {
    getChosenFields().then(({ yField }) => {
      expect(yField, 'non-None y field for title-branch coverage').to.not.equal('None');

      selectCrosstabField('@crosstabSettings', 'crosstab-x-variable', 'None', 'crosstab-xVariable');
      selectCrosstabField('@crosstabSettings', 'crosstab-y-variable', yField, 'crosstab-yVariable');

      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, 'None', yField, false);
        assertRenderedCrosstabMatches(expected);
        expect(expected.title, 'y-only title').to.not.equal('');
      });

      selectCrosstabField('@crosstabSettings', 'crosstab-y-variable', 'None', 'crosstab-yVariable');

      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, 'None', 'None', false);
        assertRenderedCrosstabMatches(expected);
        expect(expected.title, 'both-None title').to.equal('');
      });
    });
  });

  it('pivots the crosstab and swaps the x and y widget values', () => {
    configureChosenFields().then(({ xField, yField }) => {
      cy.get(byTestId(testIds.crosstabPivotButton)).click({ force: true });

      cy.window()
        .its('commonService.session.style.widgets.crosstab-xVariable')
        .should('equal', yField);

      cy.window()
        .its('commonService.session.style.widgets.crosstab-yVariable')
        .should('equal', xField);

      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, yField, xField, false);
        assertRenderedCrosstabMatches(expected);
      });
    });
  });

  it('switches from counts to proportions and normalizes the total row to 1.000', () => {
    configureChosenFields().then(({ xField, yField }) => {
      cy.get('@crosstabSettings')
        .find('#crosstab-show-mode')
        .contains('Proportion')
        .click({ force: true });

      cy.window()
        .its('commonService.session.style.widgets.crosstab-useProportion')
        .should('equal', true);

      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, xField, yField, true);
        assertRenderedCrosstabMatches(expected);
        expect(expected.footer[expected.footer.length - 1], 'total footer value').to.equal('1.000');
      });
    });
  });

  it('pivots a proportional crosstab without losing normalized totals', () => {
    configureChosenFields().then(({ xField, yField }) => {
      cy.get('@crosstabSettings')
        .find('#crosstab-show-mode')
        .contains('Proportion')
        .click({ force: true });

      cy.get(byTestId(testIds.crosstabPivotButton)).click({ force: true });

      cy.window()
        .its('commonService.session.style.widgets.crosstab-xVariable')
        .should('equal', yField);

      cy.window()
        .its('commonService.session.style.widgets.crosstab-yVariable')
        .should('equal', xField);

      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, yField, xField, true);
        assertRenderedCrosstabMatches(expected);
        expect(expected.footer[expected.footer.length - 1], 'pivoted total footer value').to.equal('1.000');
      });
    });
  });

  it('updates the table size state and recomputes the scroll height', () => {
    let defaultScrollHeight = '';

    cy.window()
      .its('commonService.visuals.crossTab.scrollHeight')
      .then((scrollHeight) => {
        defaultScrollHeight = String(scrollHeight);
      });

    cy.get('@crosstabSettings')
      .find('#crosstab-size-mode')
      .contains('Large')
      .click({ force: true });

    cy.window()
      .its('commonService.visuals.crossTab.selectedSize')
      .should('equal', 'large');

    cy.window()
      .its('commonService.visuals.crossTab.scrollHeight')
      .should((scrollHeight) => {
        expect(String(scrollHeight), 'large scroll height').to.not.equal(defaultScrollHeight);
      });

    cy.get('@crosstabSettings')
      .find('#crosstab-size-mode')
      .contains('Small')
      .click({ force: true });

    cy.window()
      .its('commonService.visuals.crossTab.selectedSize')
      .should('equal', 'small');
  });

  it('restores Crosstab widget state from saved session style widgets', () => {
    getChosenFields().then(({ yField }) => {
      expect(yField, 'restorable non-default field').to.not.equal('None');

      cy.window().then((rawWin: unknown) => {
        const win = rawWin as WinWithMT;
        const crossTab = win.commonService.visuals.crossTab;
        const widgets = win.commonService.session.style.widgets;

        ensureWindowContext(win);

        widgets['crosstab-xVariable'] = yField;
        widgets['crosstab-yVariable'] = 'cluster';
        widgets['crosstab-useProportion'] = true;

        crossTab.applyStyleFileSettings();
        (crossTab as any).cdref.detectChanges();

        expect(crossTab.xVariable, 'restored x field').to.equal(yField);
        expect(crossTab.yVariable, 'restored y field').to.equal('cluster');
        expect(widgets['crosstab-useProportion'], 'restored proportion toggle').to.equal(true);

        const expected = buildExpectedCrosstabModel(win, yField, 'cluster', true);
        assertRenderedCrosstabMatches(expected);
      });
    });
  });

  it('falls back invalid saved Crosstab fields to None', () => {
    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const crossTab = win.commonService.visuals.crossTab;
      const widgets = win.commonService.session.style.widgets;

      ensureWindowContext(win);

      widgets['crosstab-xVariable'] = 'cypress-invalid-x';
      widgets['crosstab-yVariable'] = 'cypress-invalid-y';
      widgets['crosstab-useProportion'] = false;

      crossTab.applyStyleFileSettings();
      (crossTab as any).cdref.detectChanges();

      expect(crossTab.xVariable, 'fallback x field').to.equal('None');
      expect(crossTab.yVariable, 'fallback y field').to.equal('None');
      expect(widgets['crosstab-xVariable'], 'stored fallback x widget').to.equal('None');
      expect(widgets['crosstab-yVariable'], 'stored fallback y widget').to.equal('None');

      const expected = buildExpectedCrosstabModel(win, 'None', 'None', false);
      assertRenderedCrosstabMatches(expected);
    });
  });

  it('keeps Crosstab stable when only timeline-style node visibility is cleared', () => {
    configureChosenFields().then(({ xField, yField }) => {
      cy.window().then((rawWin: unknown) => {
        const win = rawWin as WinWithMT;
        const crossTab = win.commonService.visuals.crossTab;
        const baseline = buildExpectedCrosstabModel(win, xField, yField, false);

        win.commonService.session.data.nodeFilteredValues.forEach((node: { visible: boolean }) => {
          node.visible = false;
        });

        crossTab.onFilterDataChange();
        (crossTab as any).cdref.detectChanges();

        const expected = buildExpectedCrosstabModel(win, xField, yField, false);
        assertRenderedCrosstabMatches(expected);
        expect(expected.body, 'crosstab body remains stable').to.deep.equal(baseline.body);
        expect(expected.footer, 'crosstab footer remains stable').to.deep.equal(baseline.footer);
      });

      cy.get(byTestId(testIds.crosstabSettingsButton)).should('be.visible');
      cy.get(byTestId(testIds.crosstabExportButton)).should('be.visible');
    });
  });
});
