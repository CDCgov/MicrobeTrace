/// <reference types="cypress" />

export type EpiCurveGraphType =
  | 'Single Date Field'
  | 'Multi: Side by Side'
  | 'Multi: Overlay';

export type EpiCurveFieldLabel =
  | 'Graph Type'
  | 'Date Field'
  | 'Date Field 2'
  | 'Date Field 3'
  | 'Date Field 4'
  | 'Value Field 1'
  | 'Value Field 2'
  | 'Value Field 3'
  | 'Value Field 4'
  | 'Aggregation 1'
  | 'Aggregation 2'
  | 'Aggregation 3'
  | 'Aggregation 4'
  | 'Series Type 1'
  | 'Series Type 2'
  | 'Series Type 3'
  | 'Series Type 4'
  | 'Color By'
  | 'Stack Order'
  | 'Bin Size'
  | 'Tick Unit';

export type EpiCurveBinSize = 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year';
export type EpiCurveAggregation = 'Count' | 'Sum' | 'Last' | 'Average';
export type EpiCurveLineStyle = 'Solid' | 'Dashed';
export type EpiCurveLegendPosition = 'Hide' | 'Left' | 'Top' | 'Right' | 'Bottom';
export type EpiCurveRangeLabel = 'Label Size' | 'Legend Size';
export type EpiCurveAxisTitle = 'X-axis Title' | 'Left Y-axis Title' | 'Right Y-axis Title';
export type EpiCurveTickInterval = number;

type WinWithMT = Window & {
  commonService: any;
};

type EpiCurveSettingsTab = 'Graph' | 'Appearance' | 'Order & Color';
type EpiCurveStackItem = {
  label: string;
  value: any;
  color: string;
  transparency: number;
};

function getEpiCurveSettingsDialog(): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.get('.p-dialog:visible', { timeout: 10000 })
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
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function selectEpiCurveSettingsTab(tab: EpiCurveSettingsTab): void {
  getEpiCurveSettingsDialog()
    .contains('.nav-link', new RegExp(`^${escapeRegExp(tab)}$`), { timeout: 10000 })
    .should('exist')
    .then(($tab) => {
      if (!$tab.hasClass('active')) {
        cy.wrap($tab).click({ force: true });
      }
    });

  getEpiCurveSettingsDialog()
    .contains('.nav-link', new RegExp(`^${escapeRegExp(tab)}$`), { timeout: 10000 })
    .should('have.class', 'active');
}

function selectEpiCurveFieldTab(field: EpiCurveFieldLabel): void {
  if (field === 'Color By' || field === 'Stack Order') {
    selectEpiCurveSettingsTab('Order & Color');
    return;
  }

  if (field === 'Tick Unit') {
    selectEpiCurveSettingsTab('Appearance');
    return;
  }

  selectEpiCurveSettingsTab('Graph');
}

function getEpiCurveRowByLabel(label: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.contains(
    '.p-dialog:visible .form-group.row label',
    new RegExp(`^${escapeRegExp(label)}$`),
    { timeout: 10000 },
  )
    .should('exist')
    .parents('.form-group.row')
    .first();
}

function getEpiCurveRowByText(text: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return getEpiCurveSettingsDialog()
    .contains('.form-group.row', text, { timeout: 10000 })
    .should('exist');
}

function getEpiStackOptionByLabel(label: string): Cypress.Chainable<JQuery<HTMLElement>> {
  selectEpiCurveSettingsTab('Order & Color');

  return getEpiCurveSettingsDialog()
    .find('#epi-stack-order-list [role="option"]', { timeout: 10000 })
    .should('have.length.greaterThan', 0)
    .filter((_, option) => String(option.textContent || '').includes(label))
    .first()
    .should('exist');
}

const normalizeValue = (value: string): string => String(value || '')
  .replace(/_/g, '')
  .trim()
  .toLowerCase();

const widgetPathByField: Record<EpiCurveFieldLabel, string> = {
  'Graph Type': 'commonService.session.style.widgets.epiCurve-graphType',
  'Date Field': 'commonService.session.style.widgets.epiCurve-date-fields.0',
  'Date Field 2': 'commonService.session.style.widgets.epiCurve-date-fields.1',
  'Date Field 3': 'commonService.session.style.widgets.epiCurve-date-fields.2',
  'Date Field 4': 'commonService.session.style.widgets.epiCurve-date-fields.3',
  'Value Field 1': 'commonService.session.style.widgets.epiCurve-value-fields.0',
  'Value Field 2': 'commonService.session.style.widgets.epiCurve-value-fields.1',
  'Value Field 3': 'commonService.session.style.widgets.epiCurve-value-fields.2',
  'Value Field 4': 'commonService.session.style.widgets.epiCurve-value-fields.3',
  'Aggregation 1': 'commonService.session.style.widgets.epiCurve-series-aggregations.0',
  'Aggregation 2': 'commonService.session.style.widgets.epiCurve-series-aggregations.1',
  'Aggregation 3': 'commonService.session.style.widgets.epiCurve-series-aggregations.2',
  'Aggregation 4': 'commonService.session.style.widgets.epiCurve-series-aggregations.3',
  'Series Type 1': 'commonService.session.style.widgets.epiCurve-series-types.0',
  'Series Type 2': 'commonService.session.style.widgets.epiCurve-series-types.1',
  'Series Type 3': 'commonService.session.style.widgets.epiCurve-series-types.2',
  'Series Type 4': 'commonService.session.style.widgets.epiCurve-series-types.3',
  'Color By': 'commonService.session.style.widgets.epiCurve-stackColorBy',
  'Stack Order': 'commonService.session.style.widgets.epiCurve-stackOrder',
  'Bin Size': 'commonService.session.style.widgets.epiCurve-binSize',
  'Tick Unit': 'commonService.session.style.widgets.epiCurve-tickUnit',
};

export function selectEpiCurveDropdown(field: EpiCurveFieldLabel, value: string): void {
  const visibleOverlaySelector = '.p-select-overlay:visible';

  selectEpiCurveFieldTab(field);

  getEpiCurveRowByLabel(field)
    .scrollIntoView()
    .find('.p-select')
    .first()
    .should('exist')
    .click({ force: true });

  cy.get(visibleOverlaySelector, { timeout: 10000 })
    .should('have.length.greaterThan', 0);

  cy.contains(
    `${visibleOverlaySelector} li[role="option"]`,
    new RegExp(`^${escapeRegExp(value)}$`),
    { timeout: 10000 },
  ).click({ force: true });

  cy.get('body', { timeout: 10000 })
    .find(visibleOverlaySelector)
    .should('have.length', 0);

  cy.window().should((win) => {
    const widgetValue = Cypress._.get(win, widgetPathByField[field]);

    if (widgetValue === undefined) return;

    expect(normalizeValue(String(widgetValue)), `${field} widget value`)
      .to.equal(normalizeValue(value));
  });

  getEpiCurveRowByLabel(field)
    .find('.p-select-label')
    .first()
    .should(($label) => {
      expect(normalizeValue($label.text()), `${field} select label`)
        .to.equal(normalizeValue(value));
    });
}

export function setEpiCurveLineStyle(fieldIndex: 0 | 1 | 2 | 3, style: EpiCurveLineStyle): void {
  const inputId = `#epi-line-style-select-${fieldIndex + 1}`;

  selectEpiCurveSettingsTab('Graph');

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('exist')
    .click({ force: true });

  cy.get('.p-select-overlay:visible', { timeout: 10000 })
    .should('have.length.greaterThan', 0);

  cy.contains(
    '.p-select-overlay:visible li[role="option"]',
    new RegExp(`^${escapeRegExp(style)}$`),
    { timeout: 10000 },
  ).click({ force: true });

  cy.get('.p-select-overlay:visible', { timeout: 10000 })
    .should('have.length', 0);

  cy.window()
    .its(`commonService.session.style.widgets.epiCurve-lineStyles.${fieldIndex}`)
    .should('equal', style);
}

export function setEpiCurveLineWidth(fieldIndex: 0 | 1 | 2 | 3, width: number): void {
  const inputId = `#epi-line-width-${fieldIndex + 1}`;

  selectEpiCurveSettingsTab('Graph');
  getEpiCurveSettingsDialog()
    .find(inputId)
    .scrollIntoView()
    .should('be.visible')
    .invoke('val', width)
    .trigger('input')
    .trigger('change')
    .should('have.value', `${width}`);

  cy.window()
    .its(`commonService.session.style.widgets.epiCurve-lineWidths.${fieldIndex}`)
    .should('equal', width);
}

export function setEpiCurveAxisTitle(axis: EpiCurveAxisTitle, title: string): void {
  const inputIdByAxis: Record<EpiCurveAxisTitle, string> = {
    'X-axis Title': '#epi-x-axis-label',
    'Left Y-axis Title': '#epi-left-y-axis-label',
    'Right Y-axis Title': '#epi-right-y-axis-label',
  };
  const widgetPathByAxis: Record<EpiCurveAxisTitle, string> = {
    'X-axis Title': 'commonService.session.style.widgets.epiCurve-xAxisLabel',
    'Left Y-axis Title': 'commonService.session.style.widgets.epiCurve-leftYAxisLabel',
    'Right Y-axis Title': 'commonService.session.style.widgets.epiCurve-rightYAxisLabel',
  };
  const inputId = inputIdByAxis[axis];

  selectEpiCurveSettingsTab('Appearance');
  getEpiCurveSettingsDialog()
    .find(inputId)
    .scrollIntoView()
    .should('be.visible')
    .clear();

  if (title) {
    getEpiCurveSettingsDialog()
      .find(inputId)
      .type(title);
  }

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('have.value', title);
  cy.window()
    .its(widgetPathByAxis[axis])
    .should('equal', title);
}

export function setEpiCurveSeriesLabel(fieldIndex: 0 | 1 | 2 | 3, label: string): void {
  const inputId = `#epi-series-label-${fieldIndex + 1}`;

  selectEpiCurveSettingsTab('Graph');
  getEpiCurveSettingsDialog()
    .find(inputId)
    .scrollIntoView()
    .should('be.visible')
    .clear();

  if (label) {
    getEpiCurveSettingsDialog()
      .find(inputId)
      .type(label);
  }

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('have.value', label);
  cy.window()
    .its(`commonService.session.style.widgets.epiCurve-series-labels.${fieldIndex}`)
    .should('equal', label);
}

export function setEpiCurveSeriesCumulative(
  fieldIndex: 0 | 1 | 2 | 3,
  cumulative: boolean,
): void {
  const inputId = `#epi-series-cumulative-select-${fieldIndex + 1}`;
  const optionLabel = cumulative ? 'On (running total)' : 'Off (per bin)';

  selectEpiCurveSettingsTab('Graph');
  getEpiCurveSettingsDialog()
    .find(inputId)
    .scrollIntoView()
    .should('exist')
    .click({ force: true });

  cy.contains(
    '.p-select-overlay:visible li[role="option"]',
    new RegExp(`^${escapeRegExp(optionLabel)}$`),
    { timeout: 10000 },
  ).click({ force: true });

  cy.get('body', { timeout: 10000 })
    .find('.p-select-overlay:visible')
    .should('have.length', 0);

  cy.window()
    .its(`commonService.session.style.widgets.epiCurve-series-cumulative.${fieldIndex}`)
    .should('equal', cumulative);
}

export function addEpiCurveSeries(expectedCount: 2 | 3 | 4): void {
  selectEpiCurveSettingsTab('Graph');

  getEpiCurveSettingsDialog()
    .find('#epi-add-series')
    .should('be.enabled')
    .click();

  getEpiCurveSettingsDialog()
    .find('.epi-series-card')
    .should('have.length', expectedCount);
  cy.window()
    .its('commonService.session.style.widgets.epiCurve-series-count')
    .should('equal', expectedCount);
}

export function removeEpiCurveSeries(fieldIndex: 1 | 2 | 3, expectedCount: 1 | 2 | 3): void {
  selectEpiCurveSettingsTab('Graph');

  getEpiCurveSettingsDialog()
    .find(`#epi-remove-series-${fieldIndex + 1}`)
    .click();

  getEpiCurveSettingsDialog()
    .find('.epi-series-card')
    .should('have.length', expectedCount);
  cy.window()
    .its('commonService.session.style.widgets.epiCurve-series-count')
    .should('equal', expectedCount);
}

export function setEpiCurveColor(index: 0 | 1 | 2 | 3, color: string): void {
  const inputId = index === 0
    ? '#epi-color-select'
    : `#epi-color-select-${index + 1}`;

  selectEpiCurveSettingsTab('Graph');

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = color;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.window()
    .its(`commonService.session.style.widgets.epiCurve-colors.${index}`)
    .should('equal', color);
}

export function assertEpiCurveColorPickerVisible(index: 0 | 1 | 2 | 3): void {
  const inputId = index === 0
    ? '#epi-color-select'
    : `#epi-color-select-${index + 1}`;

  selectEpiCurveSettingsTab('Graph');

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('have.length', 1)
    .then(($input) => {
      $input.get(0).scrollIntoView({ block: 'center', inline: 'nearest' });
    });

  getEpiCurveSettingsDialog()
    .find(inputId)
    .should('be.visible');
}

export function setEpiCurveRange(label: EpiCurveRangeLabel, value: number): void {
  selectEpiCurveSettingsTab('Appearance');

  getEpiCurveRowByLabel(label)
    .find('input[type="range"]')
    .invoke('val', value)
    .trigger('input')
    .trigger('change')
    .should('have.value', `${value}`);

  const expectedPath = label === 'Label Size'
    ? 'commonService.visuals.epiCurve.labelSize'
    : 'commonService.visuals.epiCurve.legendLabelSize';

  cy.window().its(expectedPath).should('equal', value);
}

export function setEpiCurveLegendPosition(position: EpiCurveLegendPosition): void {
  selectEpiCurveSettingsTab('Appearance');

  getEpiCurveRowByLabel('Legend Position')
    .contains('.p-selectbutton .p-togglebutton-label', position)
    .click({ force: true });

  cy.window()
    .its('commonService.session.style.widgets.epiCurve-legendPosition')
    .should('equal', position);
}

export function setEpiCurveCumulative(cumulative: boolean): void {
  const toggleLabel = cumulative ? 'Cumulative' : 'Noncumulative';

  selectEpiCurveSettingsTab('Graph');

  getEpiCurveRowByText('Epi Curve')
    .find('.p-selectbutton .p-togglebutton-label')
    .contains(toggleLabel)
    .click({ force: true });

  cy.window()
    .its('commonService.session.style.widgets.epiCurve-cumulative')
    .should('equal', cumulative);
}

export function setEpiCurveTickInterval(value: EpiCurveTickInterval): void {
  selectEpiCurveSettingsTab('Appearance');

  getEpiCurveSettingsDialog()
    .find('#epi-tick-size input[type="number"]')
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

  getEpiCurveSettingsDialog()
    .find('#epi-tick-size input[type="number"]')
    .should('have.value', String(value));

  cy.window()
    .its('commonService.visuals.epiCurve.tickInterval')
    .should((tickInterval) => {
      expect(Number(tickInterval), 'epi curve tick interval').to.equal(value);
    });
}

export function readEpiCurveBars():
  Cypress.Chainable<Array<{ fill: string; height: number; opacity: number; width: number; y: number }>> {
  return cy.get('#epiCurveSVG .epiCurve-epi-curve rect', { timeout: 15000 })
    .then(($rects) => [...$rects].map((rect) => ({
      fill: String(rect.getAttribute('fill') || ''),
      height: Number(rect.getAttribute('height') || 0),
      opacity: Number(rect.getAttribute('opacity') || 1),
      width: Number(rect.getAttribute('width') || 0),
      y: Number(String(rect.getAttribute('transform') || '').match(/,\s*([^)]+)\)/)?.[1] || 0),
    })));
}

export function assertEpiCurveHasBars(minCount = 1): void {
  cy.get('#epiCurveSVG .epiCurve-epi-curve rect', { timeout: 15000 })
    .should(($rects) => {
      expect($rects.length, 'epi curve bar count').to.be.greaterThan(minCount - 1);
      [...$rects].forEach((rect, index) => {
        expect(
          Number(rect.getAttribute('width') || 0),
          `bar ${index} width`,
        ).to.be.greaterThan(0);
      });
    });
}

export function countRenderableDates(field: string): Cypress.Chainable<number> {
  return cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const nodes = typedWindow.commonService.session.data.nodes || [];

    return nodes.filter((node: any) => {
      const value = node?.[field];
      return value !== undefined && value !== null && String(value).trim() !== '';
    }).length;
  });
}

export function readEpiCurveXAxisTickLabels(): Cypress.Chainable<string[]> {
  return cy.get('#epiCurveSVG .axis--x .tick text', { timeout: 15000 })
    .then(($texts) => [...$texts]
      .map((text) => String(text.textContent || '').trim())
      .filter(Boolean));
}

export function readEpiStackOrderItems(): Cypress.Chainable<EpiCurveStackItem[]> {
  return cy.window().then((win: unknown) => {
    const epiCurve = (win as WinWithMT).commonService.visuals.epiCurve as any;
    return (epiCurve.customStackOrderItems || []).map((item: EpiCurveStackItem) => ({ ...item }));
  });
}

export function readEpiStackOrderLabels(): Cypress.Chainable<string[]> {
  selectEpiCurveSettingsTab('Order & Color');

  return getEpiCurveSettingsDialog()
    .find('#epi-stack-order-list [role="option"]', { timeout: 10000 })
    .then(($options) => [...$options].map((option) => {
      const label = option.querySelector('.d-flex > span');
      return String(label?.textContent || '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean));
}

export function setEpiStackGroupColor(label: string, color: string): void {
  getEpiStackOptionByLabel(label)
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = color;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  readEpiStackOrderItems().should((items) => {
    const item = items.find((candidate) => candidate.label === label);
    expect(item?.color?.toLowerCase(), `${label} stack group color`).to.equal(color.toLowerCase());
  });
}

export function setEpiStackGroupOpacity(label: string, opacity: number): void {
  getEpiStackOptionByLabel(label)
    .find('.transparency-symbol')
    .should('have.length', 1)
    .click({ force: true });

  cy.get('#color-transparency-wrapper', { timeout: 10000 })
    .should('be.visible');

  cy.get('#color-transparency')
    .invoke('val', String(opacity))
    .trigger('change');

  readEpiStackOrderItems().should((items) => {
    const item = items.find((candidate) => candidate.label === label);
    expect(item?.transparency, `${label} stack group transparency`).to.be.closeTo(1 - opacity, 0.001);
  });
}

export function reorderEpiStackGroups(dragIndex: number, dropIndex: number): void {
  selectEpiCurveSettingsTab('Order & Color');

  cy.window().then((win: unknown) => {
    const epiCurve = (win as WinWithMT).commonService.visuals.epiCurve as any;
    const items = [...(epiCurve.customStackOrderItems || [])];
    const [movedItem] = items.splice(dragIndex, 1);

    expect(movedItem, `stack group at index ${dragIndex}`).to.exist;

    items.splice(dropIndex, 0, movedItem);
    epiCurve.customStackOrderItems = items;
    epiCurve.onCustomStackOrderReorder();
    epiCurve.cdref?.detectChanges?.();
  });
}
