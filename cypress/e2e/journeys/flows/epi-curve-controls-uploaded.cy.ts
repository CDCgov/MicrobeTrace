/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToEpiCurve,
  openEpiCurveSettingsDialog,
} from '../../../support/journey-helpers';
import {
  addEpiCurveSeries,
  assertEpiCurveHasBars,
  assertEpiCurveColorPickerVisible,
  readEpiCurveBars,
  readEpiStackOrderItems,
  readEpiStackOrderLabels,
  readEpiCurveXAxisTickLabels,
  reorderEpiStackGroups,
  removeEpiCurveSeries,
  selectEpiCurveDropdown,
  selectEpiCurveSettingsTab,
  setEpiCurveColor,
  setEpiCurveCumulative,
  setEpiCurveLegendPosition,
  setEpiCurveLineStyle,
  setEpiCurveRange,
  setEpiCurveSeriesCumulative,
  setEpiCurveSeriesLabel,
  setEpiStackGroupColor,
  setEpiStackGroupOpacity,
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

const readUniqueEpiCurveFillsInRenderOrder = (): Cypress.Chainable<string[]> =>
  readEpiCurveBars().then((bars) => bars.reduce<string[]>((fills, bar) => {
    const fill = String(bar.fill || '').trim().toLowerCase();

    if (fill && !fills.includes(fill)) {
      fills.push(fill);
    }

    return fills;
  }, []));

const assertLegendPosition = (position: 'Hide' | 'Left' | 'Top' | 'Right' | 'Bottom'): void => {
  if (position === 'Hide') {
    cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker').should('have.length', 0);
    return;
  }

  cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker')
    .should('have.length.greaterThan', 0);

  if (position === 'Left') {
    cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker')
      .first()
      .should(($marker) => {
        const cx = Number($marker.attr('cx') ?? $marker.attr('data-x'));
        const cy = Number($marker.attr('cy') ?? $marker.attr('data-y'));
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
        cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker')
          .first()
          .should(($marker) => {
            const cx = Number($marker.attr('cx') ?? $marker.attr('data-x'));
            const cy = Number($marker.attr('cy') ?? $marker.attr('data-y'));
            expect(cx, 'right legend x position').to.be.greaterThan(svgWidth * 0.45);
            expect(cy, 'right legend y position').to.be.lessThan(120);
          });
      });
    return;
  }

  if (position === 'Top') {
    cy.get('#epiCurveSVG')
      .invoke('attr', 'width')
      .then((svgWidthAttr) => {
        const svgWidth = Number(svgWidthAttr);
        cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker')
          .first()
          .should(($marker) => {
            const cx = Number($marker.attr('cx') ?? $marker.attr('data-x'));
            const cy = Number($marker.attr('cy') ?? $marker.attr('data-y'));
            expect(cx, 'top legend x position').to.be.greaterThan(svgWidth * 0.15);
            expect(cy, 'top legend y position').to.be.lessThan(120);
          });
      });
    return;
  }

  cy.get('#epiCurveSVG')
    .invoke('attr', 'height')
    .then((svgHeightAttr) => {
      const svgHeight = Number(svgHeightAttr);
      cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker')
        .first()
        .should(($marker) => {
          const cy = Number($marker.attr('cy') ?? $marker.attr('data-y'));
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

  if (dateFieldCounts == 1) {
    setEpiCurveCumulative(cumulative);
  } else {
    for (let fieldIndex = 0; fieldIndex < dateFieldCounts; fieldIndex += 1) {
      setEpiCurveSeriesCumulative(fieldIndex as 0 | 1 | 2, cumulative);
    }
  }

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

  it('reports how many records contribute to each configured series', () => {
    getEpiSettingsDialog()
      .find('#epi-data-inclusion-summary-1')
      .should('have.text', '30 of 33 records plotted · 3 missing or invalid dates');

    selectEpiCurveDropdown('Graph Type', 'Multi: Side by Side');
    selectEpiCurveDropdown('Value Field 1', 'Zipcode');
    getEpiSettingsDialog()
      .find('#epi-data-inclusion-summary-1')
      .should('have.text', '30 of 33 records plotted · 3 missing or invalid dates');

    cy.window().then((win) => {
      const epiCurve = Cypress._.get(win, 'commonService.visuals.epiCurve');
      const node = Cypress._.get(win, 'commonService.session.data.nodes')
        .find((candidate: Record<string, unknown>) =>
          candidate['Date of symptom onset Date'] && candidate.Zip_code);

      expect(node, 'record with a usable date and numeric value').to.exist;
      node.Zip_code = '';
      epiCurve.refresh();
      epiCurve.cdref.detectChanges();
    });

    getEpiSettingsDialog()
      .find('#epi-data-inclusion-summary-1')
      .should('have.text', '29 of 33 records plotted · 3 missing or invalid dates · 1 missing or nonnumeric value');
  });

  it('offers compatible date and numeric fields and explains invalid saved selections', () => {
    cy.window().then((win) => {
      const epiCurve = Cypress._.get(win, 'commonService.visuals.epiCurve');
      const dateOptions = epiCurve.FieldList.map((option: { label: string }) => option.label);
      const valueOptions = epiCurve.ValueFieldList.map((option: { label: string }) => option.label);

      expect(dateOptions, 'date field options').to.deep.equal([
        'None',
        'CollectionDate',
        'Date of symptom onset Date',
        'Date symptoms resolved',
      ]);
      expect(valueOptions, 'numeric value field options').to.deep.equal(['None', 'Zipcode']);
      expect(dateOptions, 'date field options without internal metadata')
        .not.to.include.members(['Index', 'Selected', 'Cluster', 'Visible', 'Degree', 'Origin']);
      expect(valueOptions, 'numeric options without internal metadata')
        .not.to.include.members(['Index', 'Selected', 'Cluster', 'Visible', 'Degree', 'Origin']);

      const widgets = epiCurve.widgets;
      widgets['epiCurve-date-fields'][0] = 'index';
      epiCurve.onDateFieldChange(0);
      epiCurve.cdref.detectChanges();
    });

    getEpiSettingsDialog()
      .find('.epi-field-validation')
      .should('have.text', 'Index is not a compatible date field. Choose a field containing calendar dates.');
    cy.get('#epiCurveSVG .epiCurve-epi-curve').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--x').should('have.length', 0);

    cy.window().then((win) => {
      const epiCurve = Cypress._.get(win, 'commonService.visuals.epiCurve');
      const dateField = epiCurve.FieldList.find(
        (option: { label: string }) => option.label === 'Date of symptom onset Date',
      ).value;
      const widgets = epiCurve.widgets;

      epiCurve.selectedGraphType = 'Multi: Side by Side';
      widgets['epiCurve-graphType'] = epiCurve.selectedGraphType;
      widgets['epiCurve-date-fields'][0] = dateField;
      widgets['epiCurve-value-fields'][0] = 'degree';
      widgets['epiCurve-series-aggregations'][0] = 'Sum';
      epiCurve.onGraphTypeChange();
      epiCurve.cdref.detectChanges();
    });

    getEpiSettingsDialog()
      .find('.epi-field-validation')
      .should('have.text', 'Degree is not a compatible numeric value field. Choose another field or None.');
    cy.get('#epiCurveSVG .epiCurve-epi-curve').should('have.length', 0);

    cy.closeSettingsPane('Epi Curve Settings');
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

    cy.get('#epiCurveSVG .label--right').should('not.exist');

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
    selectEpiCurveSettingsTab('Appearance');
    getEpiSettingsDialog().find('#epi-tick-size').should('not.be.visible');

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Bin Size', 'Quarter');
    selectEpiCurveSettingsTab('Appearance');
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
    assertEpiCurveColorPickerVisible(0);

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
    assertEpiCurveColorPickerVisible(0);

    setEpiCurveColor(0, secondFixedColor);

    readUniqueEpiCurveFills().then((fills) => {
      expect(fills, 'updated single-date fixed fill set').to.deep.equal([secondFixedColor]);
    });

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('applies uploaded single-date stack colors, transparency, and custom ordering', () => {
    const movedColor = '#ff00aa';
    const secondColor = '#00cc88';
    const movedOpacity = 0.4;

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Color By', 'Cluster');
    selectEpiCurveDropdown('Stack Order', 'Custom');
    setEpiCurveLegendPosition('Right');

    cy.window().then((win: any) => {
      const epiCurve = win.commonService.visuals.epiCurve;
      const widgets = win.commonService.session.style.widgets;
      const dateField = epiCurve.SelectedDateFieldVariable;
      const colorField = widgets['epiCurve-stackColorBy'];
      const nodes = win.commonService.session.data.nodes || [];
      const renderableStackValues = new Set(
        nodes
          .filter((node: any) => String(node?.[dateField] ?? '').trim() !== '')
          .map((node: any) => node?.[colorField]),
      );
      const stackItems = (epiCurve.customStackOrderItems || [])
        .map((item: any, index: number) => ({ ...item, index }));
      const renderableStackItems = stackItems
        .filter((item: any) => [...renderableStackValues].some((value) => value == item.value));

      expect(renderableStackItems.length, 'renderable stack groups').to.be.greaterThan(1);

      return {
        moved: renderableStackItems[0],
        second: renderableStackItems[1],
        dropIndex: stackItems.length - 1,
      };
    }).as('stackCase');

    cy.get<any>('@stackCase').then((stackCase) => {
      setEpiStackGroupColor(stackCase.moved.label, movedColor);
      setEpiStackGroupColor(stackCase.second.label, secondColor);
      setEpiStackGroupOpacity(stackCase.moved.label, movedOpacity);
    });

    readEpiCurveBars().should((bars) => {
      expect(
        bars.some((bar) =>
          String(bar.fill).toLowerCase() === movedColor &&
          Math.abs(Number(bar.opacity) - movedOpacity) < 0.001),
        'updated stack group color and opacity in rendered bars',
      ).to.equal(true);
      expect(
        bars.some((bar) => String(bar.fill).toLowerCase() === secondColor),
        'second updated stack group color in rendered bars',
      ).to.equal(true);
    });

    cy.get<any>('@stackCase').then((stackCase) => {
      reorderEpiStackGroups(stackCase.moved.index, stackCase.dropIndex);

      readEpiStackOrderItems().should((items) => {
        expect(items[stackCase.dropIndex].value, 'moved group in settings order').to.equal(stackCase.moved.value);
      });

      readEpiStackOrderLabels().should((labels) => {
        expect(labels[stackCase.dropIndex], 'moved group label in settings order').to.equal(stackCase.moved.label);
      });

      cy.window().its('commonService.session.style.widgets').should((widgets) => {
        expect(widgets['epiCurve-stackOrder'], 'stack order mode').to.equal('Custom');
        expect(widgets['epiCurve-customStackOrder'][0], 'internal bottom stack group').to.equal(stackCase.moved.value);
      });

      readUniqueEpiCurveFillsInRenderOrder().should((fills) => {
        expect(fills[0], 'first rendered stack fill after custom reorder').to.equal(movedColor);
      });
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
    addEpiCurveSeries(2);
    addEpiCurveSeries(3);
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
      expect(fields, 'all epi date fields after clearing').to.deep.equal(['None', 'None', 'None', 'None']);
    });

    cy.get('#epiCurveSVG .epiCurve-epi-curve rect').should('have.length', 0);
    cy.get('#epiCurveSVG .epiCurve-epi-curve .epiCurve-legend-marker').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--x').should('have.length', 0);
    cy.get('#epiCurveSVG .axis--y').should('have.length', 0);

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('stacks one additive Overlay bar by category and keeps line series separate', () => {
    const assertSegmentsAddToTotals = (): void => {
      cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment')
        .should('have.length.greaterThan', 1)
        .then(($segments) => {
          const totalsByBin = new Map<string, { segmentSum: number; total: number }>();

          [...$segments].forEach((segment) => {
            const transform = String(segment.getAttribute('transform') || '');
            const binKey = transform.match(/^translate\(([^,]+),/)?.[1] || transform;
            const entry = totalsByBin.get(binKey) || {
              segmentSum: 0,
              total: Number(segment.getAttribute('data-stack-total')),
            };
            entry.segmentSum += Number(segment.getAttribute('data-segment-value'));
            totalsByBin.set(binKey, entry);
          });

          expect(totalsByBin.size, 'stacked date bins').to.be.greaterThan(1);
          totalsByBin.forEach(({ segmentSum, total }) => {
            expect(segmentSum, 'category segments add to the displayed bar total')
              .to.be.closeTo(total, 0.001);
          });
        });
    };

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Overlay');
    addEpiCurveSeries(2);
    selectEpiCurveDropdown('Date Field', 'CollectionDate');
    selectEpiCurveDropdown('Date Field 2', 'Date of symptom onset Date');
    selectEpiCurveDropdown('Series Type 2', 'Line');
    setEpiCurveSeriesLabel(0, 'Reported cases');
    setEpiCurveSeriesLabel(1, 'Onset trend');
    selectEpiCurveDropdown('Color By', 'State');

    getEpiSettingsDialog()
      .find('.epi-stack-colors-note')
      .should('contain.text', 'The bar is stacked by category');
    cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment')
      .should('have.attr', 'data-series-axis', 'right')
      .and('have.attr', 'data-aggregation', 'count');
    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .should('have.length', 1)
      .and('have.attr', 'data-series-axis', 'left');
    cy.get('#epiCurveSVG .axis--y-right').should('exist');
    assertSegmentsAddToTotals();

    cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment title')
      .first()
      .should('contain.text', 'State —')
      .and('contain.text', 'Reported cases total:')
      .and('contain.text', 'Onset trend:');
    cy.get('#epiCurveSVG .epiCurve-legend-label')
      .then(($labels) => {
        const labels = [...$labels].map(label => String(label.textContent || '').trim());
        expect(labels.filter(label => label.startsWith('State: ')).length, 'category legend entries')
          .to.be.greaterThan(1);
        expect(labels[labels.length - 1], 'line legend entry').to.equal('Line: Onset trend');
      });

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Right');
    cy.get('#epiCurveSVG').then(($svg) => {
      const svgLeft = $svg[0].getBoundingClientRect().left;
      const rightAxis = $svg[0].querySelector('.axis--y-right');
      expect(rightAxis, 'right axis for stacked legend bounds').to.exist;
      const rightAxisLeft = (rightAxis as SVGGraphicsElement).getBoundingClientRect().left;

      cy.get('#epiCurveSVG .epiCurve-legend-label')
        .each(($label) => {
          const bounds = $label[0].getBoundingClientRect();
          expect(bounds.left, `${$label.text()} left edge`).to.be.at.least(svgLeft);
          expect(bounds.right, `${$label.text()} right edge`).to.be.lessThan(rightAxisLeft);
        });
    });

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Value Field 1', 'Zipcode');
    cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment')
      .should('have.attr', 'data-aggregation', 'sum');
    assertSegmentsAddToTotals();

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Aggregation 1', 'Last');
    cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment').should('not.exist');
    cy.get('#epiCurveSVG .epiCurve-overlay-bar')
      .should('have.attr', 'data-aggregation', 'last');
    selectEpiCurveSettingsTab('Appearance');
    getEpiSettingsDialog()
      .find('.epi-stack-colors-note')
      .should('contain.text', 'Last and Average remain unstacked');
    getEpiSettingsDialog()
      .find('#epi-stack-color-by-select')
      .should('have.attr', 'aria-disabled', 'true');

    selectEpiCurveDropdown('Aggregation 1', 'Sum');
    selectEpiCurveDropdown('Series Type 2', 'Bar');
    cy.get('#epiCurveSVG .epiCurve-stacked-bar-segment').should('not.exist');
    cy.get('#epiCurveSVG .epiCurve-overlay-bar')
      .should('have.attr', 'opacity', '0.6');
    selectEpiCurveSettingsTab('Appearance');
    getEpiSettingsDialog()
      .find('.epi-stack-colors-note')
      .should('contain.text', 'exactly one configured bar series');

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('renders uploaded multi-date controls for side-by-side bars and configurable line overlays', () => {
    let sideBySideBarWidth = 0;

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Side by Side');
    getEpiSettingsDialog().find('.epi-series-help-tooltip__content').should('not.be.visible');
    getEpiSettingsDialog().find('.epi-series-help-tooltip__trigger').focus();
    getEpiSettingsDialog().find('.epi-series-help-tooltip__content')
      .should('be.visible')
      .and('contain.text', 'Add up to four series')
      .and('contain.text', 'bars use the right axis');
    getEpiSettingsDialog().find('.epi-series-help-tooltip__trigger').blur();
    getEpiSettingsDialog().find('.epi-series-help-tooltip__content').should('not.be.visible');
    getEpiSettingsDialog().find('.epi-series-card').should('have.length', 1);
    getEpiSettingsDialog()
      .contains('.epi-series-toolbar', '1 of 4 series')
      .scrollIntoView()
      .should('be.visible');
    addEpiCurveSeries(2);
    addEpiCurveSeries(3);
    getEpiSettingsDialog().contains('label', 'Date Field 2').should('exist');
    getEpiSettingsDialog().contains('label', 'Date Field 3').should('exist');

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
    selectEpiCurveDropdown('Series Type 2', 'Line');
    selectEpiCurveDropdown('Series Type 3', 'Line');
    getEpiSettingsDialog()
      .find('#epi-line-style-select-2')
      .scrollIntoView()
      .should('be.visible');
    getEpiSettingsDialog()
      .find('#epi-line-style-select-3')
      .scrollIntoView()
      .should('be.visible');
    setEpiCurveLineStyle(1, 'Solid');
    setEpiCurveLineStyle(2, 'Dashed');
    selectEpiCurveDropdown('Value Field 2', 'Zipcode');
    selectEpiCurveDropdown('Value Field 3', 'Zipcode');
    selectEpiCurveDropdown('Aggregation 2', 'Last');
    selectEpiCurveDropdown('Aggregation 3', 'Average');

    getEpiSettingsDialog().find('.epi-series-axis-badge')
      .should('have.length', 3)
      .then(($badges) => {
        expect([...$badges].map((badge) => String(badge.textContent || '').trim()))
          .to.deep.equal(['Axis: Right', 'Axis: Left', 'Axis: Left']);
        expect([...$badges].map((badge) => badge.getAttribute('data-series-axis')))
          .to.deep.equal(['right', 'left', 'left']);
      });
    cy.get('#epiCurveSVG .label--left').should('have.text', 'Zip code');
    cy.get('#epiCurveSVG .label--right').should('have.text', 'Count of Collection Date');

    cy.get('#epiCurveSVG .epiCurve-legend-label')
      .then(($labels) => {
        expect([...$labels].map((label) => String(label.textContent || '').trim()))
          .to.deep.equal(['Collection Date', 'Zip code', 'Zip code']);
      });

    setEpiCurveSeriesLabel(0, 'Reported cases');
    setEpiCurveSeriesLabel(1, 'Cumulative doses 2025');
    setEpiCurveSeriesLabel(2, 'Cumulative doses 2024');

    cy.get('#epiCurveSVG .epiCurve-legend-label')
      .then(($labels) => {
        expect([...$labels].map((label) => String(label.textContent || '').trim()))
          .to.deep.equal(['Reported cases', 'Cumulative doses 2025', 'Cumulative doses 2024']);
      });
    cy.get('#epiCurveSVG .epiCurve-overlay-bar title')
      .first()
      .should('contain.text', 'Reported cases:')
      .and('contain.text', 'Cumulative doses 2025:')
      .and('contain.text', 'Cumulative doses 2024:');

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Right');
    cy.get('#epiCurveSVG').then(($svg) => {
      const svgLeft = $svg[0].getBoundingClientRect().left;
      const rightAxis = $svg[0].querySelector('.axis--y-right');
      expect(rightAxis, 'right axis for legend bounds').to.exist;
      const rightAxisLeft = (rightAxis as SVGGraphicsElement).getBoundingClientRect().left;

      cy.get('#epiCurveSVG .epiCurve-legend-label')
        .should('have.length', 3)
        .each(($label) => {
          const bounds = $label[0].getBoundingClientRect();
          expect(bounds.left, `${$label.text()} left edge`).to.be.at.least(svgLeft);
          expect(bounds.right, `${$label.text()} right edge`).to.be.lessThan(rightAxisLeft);
        });
      cy.get('#epiCurveSVG .epiCurve-legend-marker, #epiCurveSVG .epiCurve-legend-line')
        .should('have.length', 3)
        .each(($marker) => {
          const bounds = $marker[0].getBoundingClientRect();
          expect(bounds.left, 'legend marker left edge').to.be.at.least(svgLeft);
          expect(bounds.right, 'legend marker right edge').to.be.lessThan(rightAxisLeft);
        });
    });

    ensureEpiSettingsDialogOpen();
    setEpiCurveLegendPosition('Top');
    assertLegendPosition('Top');
    selectEpiCurveDropdown('Tick Unit', 'Day');
    setEpiCurveTickInterval(14);

    readEpiCurveBars().then((bars) => {
      expect(bars[0].width, 'overlay bar width').to.be.greaterThan(sideBySideBarWidth);
      expect(
        [...new Set(bars.map((bar) => bar.fill))].sort(),
        'primary overlay bar fill',
      ).to.deep.equal(['#aa0000']);
    });

    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .should('have.length', 2)
      .then(($lines) => {
        const lines = [...$lines].map((line) => ({
          color: line.getAttribute('stroke'),
          dashArray: line.getAttribute('stroke-dasharray'),
          fieldIndex: line.getAttribute('data-field-index'),
          style: line.getAttribute('data-line-style'),
        }));

        expect(lines).to.deep.equal([
          { color: '#00aa00', dashArray: null, fieldIndex: '1', style: 'solid' },
          { color: '#0300aa', dashArray: '10 7', fieldIndex: '2', style: 'dashed' },
        ]);
        expect($lines[0].querySelector('title')?.textContent)
          .to.equal('Cumulative doses 2025 (solid line)');
        expect($lines[1].querySelector('title')?.textContent)
          .to.equal('Cumulative doses 2024 (dashed line)');
      });
    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .eq(0)
      .should('have.attr', 'data-aggregation', 'last')
      .and('have.attr', 'data-cumulative', 'false');
    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .eq(1)
      .should('have.attr', 'data-aggregation', 'average')
      .and('have.attr', 'data-cumulative', 'false');

    cy.get('#epiCurveSVG .epiCurve-overlay-bar')
      .first()
      .should('have.attr', 'stroke', 'black')
      .and('have.attr', 'data-series-axis', 'right');
    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .should('have.attr', 'data-series-axis', 'left');
    cy.get('#epiCurveSVG .axis--y-right').should('exist');
    cy.get('#epiCurveSVG text.x.label').should('have.text', 'Date (Weekly Bins)');
    cy.get('#epiCurveSVG .label--left').should('have.text', 'Zip code');
    cy.get('#epiCurveSVG .label--right').should('have.text', 'Count of Collection Date');
    cy.get('#epiCurveSVG .epiCurve-legend-marker').should('have.length', 1);
    cy.get('#epiCurveSVG .epiCurve-legend-line').should('have.length', 2);

    cy.closeSettingsPane('Epi Curve Settings');
  });

  it('adds, removes, and renders up to four independently configured series', () => {
    let layeredBarWidth = 0;
    let aggregationsBeforeRemoval: string[] = [];
    let cumulativeBeforeRemoval: boolean[] = [];
    let datesBeforeRemoval: string[] = [];
    let labelsBeforeRemoval: string[] = [];
    let typesBeforeRemoval: string[] = [];

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Overlay');
    addEpiCurveSeries(2);
    addEpiCurveSeries(3);
    selectEpiCurveDropdown('Date Field', 'CollectionDate');
    selectEpiCurveDropdown('Date Field 2', 'Date of symptom onset Date');
    selectEpiCurveDropdown('Date Field 3', 'Date symptoms resolved');
    addEpiCurveSeries(4);
    selectEpiCurveDropdown('Date Field 4', 'Date of symptom onset Date');

    selectEpiCurveDropdown('Series Type 1', 'Bar');
    selectEpiCurveDropdown('Series Type 2', 'Bar');
    selectEpiCurveDropdown('Series Type 3', 'Line');
    selectEpiCurveDropdown('Series Type 4', 'Line');
    setEpiCurveLineStyle(2, 'Solid');
    setEpiCurveLineStyle(3, 'Dashed');
    selectEpiCurveDropdown('Value Field 3', 'Zipcode');
    selectEpiCurveDropdown('Value Field 4', 'Zipcode');
    selectEpiCurveDropdown('Aggregation 3', 'Last');
    selectEpiCurveDropdown('Aggregation 4', 'Average');
    setEpiCurveSeriesCumulative(3, true);
    setEpiCurveSeriesLabel(0, 'Series A');
    setEpiCurveSeriesLabel(1, 'Series B');
    setEpiCurveSeriesLabel(2, 'Series C');
    setEpiCurveSeriesLabel(3, 'Series D');

    setEpiCurveColor(0, '#aa0000');
    setEpiCurveColor(1, '#00aa00');
    setEpiCurveColor(2, '#0300aa');
    setEpiCurveColor(3, '#cc00cc');

    getEpiSettingsDialog().find('.epi-series-card').should('have.length', 4);
    getEpiSettingsDialog().find('#epi-add-series').should('be.disabled');

    cy.get('#epiCurveSVG .epiCurve-overlay-bar')
      .should('have.length.greaterThan', 1)
      .then(($bars) => {
        const bars = [...$bars];
        expect(
          [...new Set(bars.map((bar) => bar.getAttribute('data-field-index')))].sort(),
          'layered bar series indexes',
        ).to.deep.equal(['0', '1']);
        expect(
          [...new Set(bars.map((bar) => bar.getAttribute('opacity')))],
          'layered bar opacity',
        ).to.deep.equal(['0.6']);
        layeredBarWidth = Number(bars[0].getAttribute('width'));
        expect(layeredBarWidth, 'layered bar width').to.be.greaterThan(0);
      });

    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .should('have.length', 2)
      .then(($lines) => {
        expect([...$lines].map((line) => ({
          aggregation: line.getAttribute('data-aggregation'),
          cumulative: line.getAttribute('data-cumulative'),
          fieldIndex: line.getAttribute('data-field-index'),
          style: line.getAttribute('data-line-style'),
        }))).to.deep.equal([
          { aggregation: 'last', cumulative: 'false', fieldIndex: '2', style: 'solid' },
          { aggregation: 'average', cumulative: 'true', fieldIndex: '3', style: 'dashed' },
        ]);
      });
    cy.get('#epiCurveSVG .axis--y-right').should('exist');
    cy.get('#epiCurveSVG .epiCurve-legend-marker').should('have.length', 2);
    cy.get('#epiCurveSVG .epiCurve-legend-line').should('have.length', 2);

    ensureEpiSettingsDialogOpen();
    selectEpiCurveDropdown('Graph Type', 'Multi: Side by Side');
    cy.get('#epiCurveSVG .epiCurve-bar-series')
      .first()
      .invoke('attr', 'width')
      .then((width) => {
        expect(Number(width), 'grouped bar width').to.be.lessThan(layeredBarWidth);
      });
    cy.get('#epiCurveSVG .epiCurve-line-overlay').should('have.length', 2);
    cy.get('#epiCurveSVG .axis--y-right').should('exist');

    cy.window().then((win) => {
      aggregationsBeforeRemoval = [...Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-aggregations')];
      cumulativeBeforeRemoval = [...Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-cumulative')];
      datesBeforeRemoval = [...Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-date-fields')];
      labelsBeforeRemoval = [...Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-labels')];
      typesBeforeRemoval = [...Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-types')];
    });

    ensureEpiSettingsDialogOpen();
    removeEpiCurveSeries(1, 3);

    cy.window().then((win) => {
      const aggregations = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-aggregations');
      const cumulative = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-cumulative');
      const dates = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-date-fields');
      const labels = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-labels');
      const types = Cypress._.get(win, 'commonService.session.style.widgets.epiCurve-series-types');
      expect(aggregations, 'aggregations compact after removal').to.deep.equal([
        aggregationsBeforeRemoval[0],
        aggregationsBeforeRemoval[2],
        aggregationsBeforeRemoval[3],
        'Count',
      ]);
      expect(cumulative, 'cumulative transforms compact after removal').to.deep.equal([
        cumulativeBeforeRemoval[0],
        cumulativeBeforeRemoval[2],
        cumulativeBeforeRemoval[3],
        false,
      ]);
      expect(dates, 'date fields compact after removal').to.deep.equal([
        datesBeforeRemoval[0],
        datesBeforeRemoval[2],
        datesBeforeRemoval[3],
        'None',
      ]);
      expect(labels, 'series labels compact after removal').to.deep.equal([
        labelsBeforeRemoval[0],
        labelsBeforeRemoval[2],
        labelsBeforeRemoval[3],
        '',
      ]);
      expect(types, 'series types compact after removal').to.deep.equal([
        typesBeforeRemoval[0],
        typesBeforeRemoval[2],
        typesBeforeRemoval[3],
        'Bar',
      ]);
    });
    getEpiSettingsDialog().find('#epi-add-series').should('be.enabled');
    cy.get('#epiCurveSVG .epiCurve-bar-series')
      .should('have.attr', 'data-field-index', '0');
    cy.get('#epiCurveSVG .epiCurve-line-overlay')
      .should('have.length', 2)
      .then(($lines) => {
        expect([...$lines].map((line) => line.getAttribute('data-field-index')))
          .to.deep.equal(['1', '2']);
      });

    cy.closeSettingsPane('Epi Curve Settings');
  });

});
