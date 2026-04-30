/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToEpiCurve,
  openEpiCurveSettingsDialog,
} from '../../../support/journey-helpers';
import {
  assertEpiCurveHasBars,
  readEpiCurveBars,
  readEpiCurveXAxisTickLabels,
  selectEpiCurveDropdown,
  setEpiCurveColor,
  setEpiCurveCumulative,
  setEpiCurveLegendPosition,
  setEpiCurveRange,
  setEpiCurveTickInterval,
} from '../../../support/epi-curve-helpers';

const profile = getProfile('timeline-covid-node-link');

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
};

const readUniqueEpiCurveFills = (): Cypress.Chainable<string[]> =>
  readEpiCurveBars().then((bars) => [...new Set(
    bars
      .map((bar) => String(bar.fill || '').trim().toLowerCase())
      .filter(Boolean),
  )].sort());

const assertLegendPosition = (position: 'Hide' | 'Left' | 'Right' | 'Bottom'): void => {
  if (position === 'Hide') {
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 0);
    return;
  }

  cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
    .should('have.length.greaterThan', 0);

  if (position === 'Left') {
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
      .first()
      .should(($circle) => {
        const cx = Number($circle.attr('cx'));
        const cy = Number($circle.attr('cy'));
        expect(cx, 'left legend x position').to.be.lessThan(120);
        expect(cy, 'left legend y position').to.be.lessThan(120);
      });
    return;
  }

  if (position === 'Right') {
    cy.get('#epiCurveSVG')
      .invoke('attr', 'width')
      .then((svgWidthAttr) => {
        const svgWidth = Number(svgWidthAttr);
        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .first()
          .should(($circle) => {
            const cx = Number($circle.attr('cx'));
            const cy = Number($circle.attr('cy'));
            expect(cx, 'right legend x position').to.be.greaterThan(svgWidth * 0.45);
            expect(cy, 'right legend y position').to.be.lessThan(120);
          });
      });
    return;
  }

  cy.get('#epiCurveSVG')
    .invoke('attr', 'height')
    .then((svgHeightAttr) => {
      const svgHeight = Number(svgHeightAttr);
      cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
        .first()
        .should(($circle) => {
          const cy = Number($circle.attr('cy'));
          expect(cy, 'bottom legend y position').to.be.greaterThan(svgHeight * 0.45);
        });
    });
};

const assertCumulativeTransition = (
  cumulative: boolean,
  dateFieldCounts: 1 | 2 | 3 = 1,
): void => {
  let previousHeights: number[] = [];

  const splitByField = (heights: number[]): number[][] => {
    expect(
      heights.length % dateFieldCounts,
      `rect count (${heights.length}) should be divisible by dateFieldCounts (${dateFieldCounts})`,
    ).to.equal(0);

    const fieldSize = heights.length / dateFieldCounts;
    const chunks: number[][] = [];

    for (let index = 0; index < dateFieldCounts; index += 1) {
      chunks.push(heights.slice(index * fieldSize, (index + 1) * fieldSize));
    }

    return chunks;
  };

  readEpiCurveBars().then((bars) => {
    previousHeights = bars.map((bar) => bar.height);
  });

  setEpiCurveCumulative(cumulative);

  readEpiCurveBars().then((bars) => {
    const nextHeights = bars.map((bar) => bar.height);

    expect(nextHeights.length, 'rect count after cumulative toggle').to.be.greaterThan(1);
    expect(nextHeights.length, 'rect count after cumulative toggle').to.equal(previousHeights.length);

    const nextByField = splitByField(nextHeights);
    const previousByField = splitByField(previousHeights);

    if (cumulative) {
      nextByField.forEach((fieldHeights, fieldIndex) => {
        const hasDecrease = fieldHeights.some((height, index) => index > 0 && height < fieldHeights[index - 1]);
        expect(hasDecrease, `cumulative bars should not decrease for date field ${fieldIndex + 1}`).to.equal(false);
      });
      return;
    }

    const hasLowerBar = nextByField.some((fieldHeights, fieldIndex) =>
      fieldHeights.some((height, index) => height < previousByField[fieldIndex][index]));

    expect(hasLowerBar, 'noncumulative should reduce at least one bar vs cumulative').to.equal(true);
  });
};

describe('Journey Flow - Epi Curve controls on uploaded data', () => {
  beforeEach(() => {
    launchProfileToEpiCurve(profile);
    assertAfterLaunchCounts(profile);
    openEpiCurveSettingsDialog();
    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    assertEpiCurveHasBars();
    ensureEpiSettingsDialogOpen();
  });

  it('applies uploaded single-date settings and keeps the rendered SVG in sync', () => {
    const updatedLabelSize = 22;
    const updatedLegendSize = 24;
    let initialLabelSize = 0;
    let initialLegendTextSize = 0;
    let initialBars: Array<{ fill: string; height: number; width: number }> = [];

    readEpiCurveBars().then((bars) => {
      initialBars = bars;
    });

    cy.get('#epiCurveSVG text.x.label')
      .should('exist')
      .invoke('attr', 'font-size')
      .then((fontSizeAttr) => {
        initialLabelSize = Number(fontSizeAttr || 0);
        expect(initialLabelSize).to.be.greaterThan(0);
      });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Day');

    cy.get('#epiCurveSVG text.x.label').should('contain.text', 'Date (Daily Bins)');
    readEpiCurveBars().then((bars) => {
      expect(bars.length, 'bar count after bin size change').to.be.greaterThan(0);
      const changedBarCount = bars.length !== initialBars.length;
      const changedBarWidth = bars[0].width !== initialBars[0].width;

      expect(
        changedBarCount || changedBarWidth,
        'bin size change should update the rendered bar geometry',
      ).to.equal(true);
    });

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Left');
    assertLegendPosition('Left');

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Right');
    assertLegendPosition('Right');

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Bottom');
    assertLegendPosition('Bottom');

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Hide');
    assertLegendPosition('Hide');

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Right');
    assertLegendPosition('Right');

    cy.get('#epiCurveSVG .epiCurve-epi-curve text')
      .first()
      .should('exist')
      .then(($legendText) => {
        initialLegendTextSize = parseFloat($legendText.css('font-size'));
        expect(initialLegendTextSize).to.be.greaterThan(0);
      });

    ensureEpiSettingsDialogOpen();
    setEpiCurveRange('Label Size', updatedLabelSize);

    cy.get('#epiCurveSVG text.x.label')
      .should(($xLabel) => {
        const nextLabelSize = Number($xLabel.attr('font-size') || 0);
        expect(nextLabelSize).to.equal(updatedLabelSize);
        expect(nextLabelSize).to.be.greaterThan(initialLabelSize);
      });

    cy.get('#epiCurveSVG text.y.label')
      .should(($yLabel) => {
        const nextLabelSize = Number($yLabel.attr('font-size') || 0);
        expect(nextLabelSize).to.equal(updatedLabelSize);
      });

    ensureEpiSettingsDialogOpen();
    setEpiCurveRange('Legend Size', updatedLegendSize);

    cy.get('#epiCurveSVG .epiCurve-epi-curve text')
      .first()
      .should(($legendText) => {
        const nextLegendTextSize = parseFloat($legendText.css('font-size'));
        expect(nextLegendTextSize).to.equal(updatedLegendSize);
        expect(nextLegendTextSize).to.be.greaterThan(initialLegendTextSize);
      });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Week');
    assertEpiCurveHasBars(2);

    ensureEpiSettingsDialogOpen();
    assertCumulativeTransition(true);
    ensureEpiSettingsDialogOpen();
    assertCumulativeTransition(false);

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('updates the uploaded x-axis interval and handles the Year and Quarter control rules', () => {
    let defaultTickLabels: string[] = [];

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Month');

    readEpiCurveXAxisTickLabels().then((labels) => {
      defaultTickLabels = labels;
      expect(labels.length, 'default month tick labels').to.be.greaterThan(1);
    });

    ensureEpiSettingsDialogOpen();
    setEpiCurveTickInterval(2);

    readEpiCurveXAxisTickLabels().then((labels) => {
      expect(labels.length, 'tick labels after interval change').to.be.greaterThan(0);
      expect(labels.length, 'tick label count should shrink when interval increases')
        .to.be.lessThan(defaultTickLabels.length);
    });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Year');
    getEpiSettingsDialog().find('#epi-tick-size').should('not.be.visible');

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Quarter');
    getEpiSettingsDialog().find('#epi-tick-size').should('be.visible');
    cy.window()
      .its('commonService.visuals.epiCurve.tickInterval')
      .should((tickInterval) => {
        expect(Number(tickInterval), 'quarter tick interval reset').to.equal(1);
      });

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('applies the uploaded single-date fixed color path and toggles the color picker with Color By', () => {
    const firstFixedColor = '#ff0000';
    const secondFixedColor = '#00aaff';

    ensureEpiSettingsDialogOpen();
    getEpiSettingsDialog().find('#epi-color-select').should('be.visible');

    setEpiCurveColor(0, firstFixedColor);

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills, 'single-date fixed fill set').to.deep.equal([firstFixedColor]);
    });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'Cluster');
    getEpiSettingsDialog().find('#epi-color-select').should('not.exist');

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills.length, 'cluster color fill count').to.be.greaterThan(1);
      expect(fills, 'cluster colors should replace the fixed fill').not.to.deep.equal([firstFixedColor]);
    });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'None');
    getEpiSettingsDialog().find('#epi-color-select').should('exist');

    setEpiCurveColor(0, secondFixedColor);

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills, 'updated single-date fixed fill set').to.deep.equal([secondFixedColor]);
    });

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('clears stale uploaded Epi rendering when active date fields are reset to None', () => {
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field', 'None');

    cy.window()
      .its('commonService.session.style.widgets.epiCurve-date-fields.0')
      .should('equal', 'None');

    cy.get('#epiCurveSVG .epiCurve-epi-curve rect').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--x').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--y').should('have.length', 0);

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Side by Side');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field', 'CollectionDate');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 2', 'Date of symptom onset Date');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 3', 'Date symptoms resolved');

    assertEpiCurveHasBars(6);

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 3', 'None');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 2', 'None');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field', 'None');

    cy.window().should((win) => {
      const fields = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-date-fields');
      expect(fields, 'all epi date fields after clearing').to.deep.equal(['None', 'None', 'None']);
    });

    cy.get('#epiCurveSVG .epiCurve-epi-curve rect').should('have.length', 0);
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--x').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--y').should('have.length', 0);

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('renders uploaded multi-date controls for side-by-side and overlay graph types', () => {
    let sideBySideBarWidth = 0;

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Side by Side');
    getEpiSettingsDialog().contains('label', 'Date Field 2').should('be.visible');
    getEpiSettingsDialog().contains('label', 'Date Field 3').should('be.visible');

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field', 'CollectionDate');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 2', 'Date of symptom onset Date');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Date Field 3', 'Date symptoms resolved');

    ensureEpiSettingsDialogOpen();
    setEpiCurveColor(0, '#aa0000');
    ensureEpiSettingsDialogOpen();
    setEpiCurveColor(1, '#00aa00');
    ensureEpiSettingsDialogOpen();
    setEpiCurveColor(2, '#0300aa');
    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Week');

    assertEpiCurveHasBars(6);
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 3);

    readEpiCurveBars().then((bars) => {
      sideBySideBarWidth = bars[0].width;
      expect(sideBySideBarWidth, 'side-by-side bar width').to.be.greaterThan(0);
      expect(
        [...new Set(bars.map((bar) => bar.fill))].sort(),
        'multi-date side-by-side fill set',
      ).to.deep.equal(['#00aa00', '#0300aa', '#aa0000']);
    });

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Bottom');
    assertLegendPosition('Bottom');

    ensureEpiSettingsDialogOpen();
    assertCumulativeTransition(true, 3);
    ensureEpiSettingsDialogOpen();
    assertCumulativeTransition(false, 3);

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Overlay');

    readEpiCurveBars().then((bars) => {
      expect(bars[0].width, 'overlay bar width').to.be.greaterThan(sideBySideBarWidth);
      expect(
        [...new Set(bars.map((bar) => bar.fill))].sort(),
        'multi-date overlay fill set',
      ).to.deep.equal(['#00aa00', '#0300aa', '#aa0000']);
    });

    cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
      .first()
      .should('have.attr', 'opacity', '0.6');
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 3);

    cy.closeSettingsPane('Epi Curve Settings');
  });
});
