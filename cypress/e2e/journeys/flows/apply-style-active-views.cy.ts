/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAlignmentReady,
  assertBubbleReady,
  assertCrosstabReady,
  assertEpiCurveReady,
  goToBubbleView,
  launchProfileToAlignment,
  launchProfileToCrosstab,
  launchProfileToEpiCurve,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertRenderedCrosstabMatches,
  buildExpectedCrosstabModel,
  chooseCrosstabFields,
} from '../../../support/crosstab-helpers';
import { assertEpiCurveHasBars } from '../../../support/epi-curve-helpers';

type WinWithMT = Window & {
  commonService: any;
};

const uploadStyleToActiveView = (
  fileName: string,
  widgetOverrides: Record<string, unknown>,
): void => {
  cy.window()
    .then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const style = JSON.parse(JSON.stringify(win.commonService.session.style));

      style.widgets = {
        ...style.widgets,
        ...widgetOverrides,
      };

      return JSON.stringify(style);
    })
    .then((contents) => {
      cy.openGlobalSettings();
      cy.contains('.nav-link:visible', 'Styling').click({ force: true });
      cy.get('#apply-style').selectFile({
        contents: Cypress.Buffer.from(contents),
        fileName,
        mimeType: 'application/json',
      }, { force: true });
    });

  cy.window()
    .its('commonService.session.style.widgets', { timeout: 15000 })
    .should((widgets) => {
      Object.entries(widgetOverrides).forEach(([key, expected]) => {
        expect(widgets[key], `uploaded ${key}`).to.deep.equal(expected);
      });
    });

  cy.closeGlobalSettings();
};

describe('Journey Flow - Apply Style while a target view is active', () => {
  const bubbleProfile = getProfile('style-apply-cypress-test-style');
  const alignmentProfile = getProfile('alignment-angulartesting-sequence-node-list');
  const timelineProfile = getProfile('timeline-covid-node-link');

  it('updates the open Bubble view without navigating away or recreating it', () => {
    const bubbleSize = 29;
    let activeBubble: any;

    launchProfileToTwoD(bubbleProfile);
    goToBubbleView();
    assertBubbleReady();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      activeBubble = win.commonService.visuals.bubble;
    });

    uploadStyleToActiveView('cypress-active-bubble.style', {
      'bubble-x': 'State',
      'bubble-y': 'Node_Class',
      'bubble-size': bubbleSize,
      'bubble-collapsed': false,
    });

    cy.window().should((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const bubble = win.commonService.visuals.bubble;

      expect(win.commonService.activeTab, 'active view after style upload').to.equal('Bubble');
      expect(bubble, 'same Bubble component instance').to.equal(activeBubble);
      expect(bubble.xVariable, 'Bubble x axis').to.equal('State');
      expect(bubble.yVariable, 'Bubble y axis').to.equal('Node_Class');
      expect(bubble.nodeSize, 'Bubble node size').to.equal(bubbleSize);

      bubble.cy.nodes()
        .filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'))
        .forEach((node: any) => {
          expect(Number(node.data('nodeSize')), `rendered size for Bubble node ${node.id()}`)
            .to.equal(bubbleSize);
        });
    });
  });

  it('updates the open Alignment view without navigating away or recreating it', () => {
    const spanWidth = 7;
    const spanHeight = 18;
    let activeAlignment: any;

    launchProfileToAlignment(alignmentProfile);
    assertAlignmentReady();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      activeAlignment = win.commonService.visuals.alignment;
    });

    uploadStyleToActiveView('cypress-active-alignment.style', {
      'alignView-selectedSize': 'c',
      'alignView-spanWidth': spanWidth,
      'alignView-spanHeight': spanHeight,
      'alignView-showMiniMap': false,
      'alignView-topDisplay': 'logo',
      'alignView-colorSchemeName': 'a',
    });

    cy.window().should((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const alignment = win.commonService.visuals.alignment;

      expect(win.commonService.activeTab, 'active view after style upload').to.equal('Alignment View');
      expect(alignment, 'same Alignment component instance').to.equal(activeAlignment);
      expect(alignment.spanWidth, 'Alignment span width').to.equal(spanWidth);
      expect(alignment.spanHeight, 'Alignment span height').to.equal(spanHeight);
      expect(alignment.colorScheme.A, 'Alignment alternative A color').to.equal('#009E73');
    });

    cy.get('#miniMapHolder').should('not.be.visible');
    cy.get('#alignmnetTopTitle').should('have.text', 'Logo');
    cy.get('.canvasHolder canvas').should(($canvas) => {
      const canvas = $canvas.get(0) as HTMLCanvasElement;

      expect(canvas.width, 'styled Alignment canvas width')
        .to.equal(activeAlignment.longestSeqLength * spanWidth);
      expect(canvas.height, 'styled Alignment canvas height')
        .to.equal(activeAlignment.nodesWithSeq.length * spanHeight);
    });
  });

  it('updates the open Epi Curve without navigating away or recreating it', () => {
    const dateField = 'Date of symptom onset Date';
    let activeEpiCurve: any;

    launchProfileToEpiCurve(timelineProfile);
    assertEpiCurveReady();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      activeEpiCurve = win.commonService.visuals.epiCurve;
    });

    cy.get('body').then(($body) => {
      if ($body.find('.p-dialog-title:visible:contains("Epi Curve Settings")').length) {
        cy.closeSettingsPane('Epi Curve Settings');
      }
    });

    uploadStyleToActiveView('cypress-active-epi-curve.style', {
      'epiCurve-graphType': 'Single Date Field',
      'epiCurve-date-fields': [dateField, 'None', 'None'],
      'epiCurve-binSize': 'Week',
      'epiCurve-cumulative': true,
      'epiCurve-legendPosition': 'Bottom',
    });

    cy.window().should((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const epiCurve = win.commonService.visuals.epiCurve;

      expect(win.commonService.activeTab, 'active view after style upload').to.equal('Epi Curve');
      expect(epiCurve, 'same Epi Curve component instance').to.equal(activeEpiCurve);
      expect(epiCurve.SelectedDateFieldVariable, 'Epi Curve date field').to.equal(dateField);
      expect(epiCurve.selectedGraphType, 'Epi Curve graph type').to.equal('Single Date Field');
    });

    assertEpiCurveHasBars();
    cy.get('#epiCurveSVG text.x.label').should('contain.text', 'Weekly Bins');
  });

  it('updates the open Crosstab without navigating away or recreating it', () => {
    let activeCrosstab: any;

    launchProfileToCrosstab(timelineProfile);
    assertCrosstabReady();

    cy.window()
      .then((rawWin: unknown) => {
        const win = rawWin as WinWithMT;
        const fields = chooseCrosstabFields(win);

        expect(fields.yField, 'uploaded Crosstab y field').not.to.equal('None');
        activeCrosstab = win.commonService.visuals.crossTab;

        return fields;
      })
      .then(({ xField, yField }) => {
        cy.closeSettingsPane('Crosstab Settings');

        uploadStyleToActiveView('cypress-active-crosstab.style', {
          'crosstab-xVariable': yField,
          'crosstab-yVariable': xField,
          'crosstab-useProportion': true,
        });

        cy.window().should((rawWin: unknown) => {
          const win = rawWin as WinWithMT;
          const crosstab = win.commonService.visuals.crossTab;

          expect(win.commonService.activeTab, 'active view after style upload').to.equal('Crosstab');
          expect(crosstab, 'same Crosstab component instance').to.equal(activeCrosstab);
          expect(crosstab.xVariable, 'Crosstab x field').to.equal(yField);
          expect(crosstab.yVariable, 'Crosstab y field').to.equal(xField);
        });

        cy.window().then((rawWin: unknown) => {
          const win = rawWin as WinWithMT;
          const expected = buildExpectedCrosstabModel(win, yField, xField, true);

          assertRenderedCrosstabMatches(expected);
        });
      });
  });
});
