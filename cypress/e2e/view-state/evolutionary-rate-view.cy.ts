/// <reference types="cypress" />

import {
  goToEvolutionaryRateView,
  installSaveAsCaptureHook,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

type EvolutionaryRateWindow = Window & {
  commonService: any;
};

const DATE_FIELD = 'collectionDate';

function continueWithLoadedSampleDataset(): void {
  cy.get('body').then(($body) => {
    const sampleDatasetButton = byTestId(testIds.appSampleDatasetButton);
    if (!$body.find(`${sampleDatasetButton}:visible`).length) return;

    cy.window({ timeout: 30000 })
      .its('commonService.session.data.nodes')
      .should('have.length.greaterThan', 0);
    cy.get(sampleDatasetButton).click({ force: true });
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  });
}

function getVisibleDialog(title: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.contains('.p-dialog-title', title, { timeout: 10000 })
    .should('be.visible')
    .parents('.p-dialog')
    .should('be.visible');
}

function seedEvolutionaryRateFields(): void {
  cy.window().then((win: unknown) => {
    const commonService = (win as EvolutionaryRateWindow).commonService;
    const data = commonService.session.data;
    const fields = data.nodeFields as string[];

    if (!fields.includes(DATE_FIELD)) fields.push(DATE_FIELD);

    const filteredNodes = (data.nodeFilteredValues as any[]).filter((node) => node.visible);
    const sourceNodes = new Map((data.nodes as any[]).map((node) => [String(node._id ?? node.id), node]));

    filteredNodes.forEach((node, index) => {
      node[DATE_FIELD] = '2020-02-30';

      if (index < 3) {
        node[DATE_FIELD] = `${2020 + index}-01-01`;
      }

      Object.assign(sourceNodes.get(String(node._id ?? node.id)) || {}, {
        [DATE_FIELD]: node[DATE_FIELD],
      });
    });

    const datedIds = filteredNodes.slice(0, 3).map((node) => String(node._id ?? node.id));
    datedIds.slice(1).forEach((targetId, index) => {
      const sourceId = datedIds[0];
      let link = commonService.temp.matrix?.[sourceId]?.[targetId]
        ?? commonService.temp.matrix?.[targetId]?.[sourceId];
      if (!link) {
        commonService.addLink({
          source: sourceId,
          target: targetId,
          origin: ['Evolutionary Rate Cypress'],
          distanceOrigin: 'Evolutionary Rate Cypress',
          distance: (index + 1) * 2,
          hasDistance: true,
          directed: false,
        }, true);
        link = commonService.temp.matrix?.[sourceId]?.[targetId]
          ?? commonService.temp.matrix?.[targetId]?.[sourceId];
      }
      link.distance = (index + 1) * 2;
      link.hasDistance = true;
    });
  });
}

function chooseDateField(): void {
  cy.get(byTestId(testIds.evolutionaryRateDateField)).click({ force: true });
  cy.get('p-selectitem', { timeout: 10000 })
    .contains('li', DATE_FIELD)
    .click({ force: true });
}

function getEvolutionaryRateComponent(): Cypress.Chainable<any> {
  return cy.window().its('commonService.visuals.evolutionaryRate');
}

function getRenderedMarkerStrokeWidth(dataUri: string, markerSize: number): number {
  const encodedSvg = dataUri.slice(dataUri.indexOf(',') + 1);
  const svgDocument = new DOMParser().parseFromString(
    decodeURIComponent(encodedSvg),
    'image/svg+xml',
  );
  const viewBox = String(svgDocument.documentElement.getAttribute('viewBox') || '')
    .trim()
    .split(/\s+/)
    .map(Number);
  const strokeElement = svgDocument.querySelector('[stroke-width]');
  const svgStrokeWidth = Number(strokeElement?.getAttribute('stroke-width'));

  expect(viewBox, 'marker SVG viewBox').to.have.length(4);
  expect(viewBox[2], 'marker SVG viewBox width').to.be.greaterThan(0);
  expect(svgStrokeWidth, 'marker SVG stroke width').to.be.greaterThan(0);

  return svgStrokeWidth * markerSize / viewBox[2];
}

describe('Evolutionary Rate view state', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    continueWithLoadedSampleDataset();
    seedEvolutionaryRateFields();
    goToEvolutionaryRateView();
  });

  it('opens settings automatically and renders the regression, statistics, and row counts', () => {
    getVisibleDialog('Evolutionary Rate Settings');
    cy.get('[data-testid="evolutionary-rate-settings-button"]')
      .should('have.class', 'btn-clean')
      .and('have.class', 'btn-icon')
      .and('have.css', 'float', 'left')
      .parent()
      .should('have.css', 'position', 'relative')
      .and('have.css', 'overflow', 'visible')
      .and('have.css', 'width', '110px');
    cy.get('[data-testid="evolutionary-rate-export-button"]')
      .should('have.attr', 'title', 'Export Screen')
      .and('have.class', 'btn-clean')
      .and('have.class', 'btn-icon')
      .and('have.css', 'float', 'left');
    cy.get('#tool-btn-container-evolutionary-rate')
      .should('have.css', 'background-color', 'rgb(255, 255, 255)')
      .find('a')
      .should('have.length', 3)
      .each(($button) => {
        expect($button.css('background-color'), 'opaque toolbar button background').to.equal('rgb(255, 255, 255)');
        expect($button.css('box-shadow'), 'toolbar button square shadow').not.to.equal('none');
      });
    cy.get('#tool-btn-container-evolutionary-rate').then(($toolbar) => {
      cy.get('.evolutionary-rate-chart-wrapper').then(($plot) => {
        const toolbarBounds = $toolbar[0].getBoundingClientRect();
        const plotBounds = $plot[0].getBoundingClientRect();
        expect(toolbarBounds.bottom, 'toolbar bottom').to.be.at.most(plotBounds.top);
      });
    });
    cy.get('[data-testid="evolutionary-rate-detected-field"]')
      .should('contain.text', 'SNPs distance');
    cy.get('[data-testid="evolutionary-rate-root-method"]').should('not.exist');

    chooseDateField();
    cy.closeSettingsPane('Evolutionary Rate Settings');

    cy.get('[data-testid="evolutionary-rate-x-axis-title"]').should('have.text', DATE_FIELD);
    cy.get('[data-testid="evolutionary-rate-y-axis-title"]').should('have.text', 'Genetic Distance (SNPs)');
    cy.get('[data-testid="evolutionary-rate-point"]').should('have.length', 3);
    cy.get('[data-testid="evolutionary-rate-regression-line"]').should(($line) => {
      const line = $line[0];
      const plotWidth = Number((line as SVGLineElement).ownerSVGElement
        ?.querySelector('clipPath rect')?.getAttribute('width'));
      expect(Number(line.getAttribute('x1')), 'regression starts at the Y-axis').to.equal(0);
      expect(Number(line.getAttribute('x2')), 'regression reaches the right plot boundary').to.equal(plotWidth);
    });
    cy.get(byTestId(testIds.evolutionaryRateExcludedDataButton))
      .should('not.have.text', '0')
      .and('have.css', 'color', 'rgb(255, 0, 0)')
      .click({ force: true });
    getVisibleDialog('Excluded Data Points')
      .and('contain.text', 'Missing or invalid collectionDate value.')
      .find('[data-testid="evolutionary-rate-excluded-data-row"]')
      .should('have.length.greaterThan', 0);
    cy.closeSettingsPane('Excluded Data Points');
    cy.get(byTestId(testIds.evolutionaryRateStatistics)).should('be.visible');
    cy.get(byTestId(testIds.evolutionaryRateStatistics)).should(($statistics) => {
      const style = getComputedStyle($statistics[0]);
      expect(style.bottom, 'statistics card bottom anchor').not.to.equal('auto');
      expect(Number.parseFloat(style.bottom), 'statistics card clearance above X-axis labels').to.be.at.least(80);
      expect(style.right, 'statistics card right anchor').not.to.equal('auto');
    });
    cy.get('[data-testid="evolutionary-rate-date-range"]')
      .should('have.text', '2020-01-01 – 2022-01-01 (2.00 years)');
    cy.get('[data-testid="evolutionary-rate-slope"]').should('have.text', '2');
    cy.get('[data-testid="evolutionary-rate-tmrca"]').should('have.text', '2020-01-01');
    cy.get('[data-testid="evolutionary-rate-correlation"]').should('have.text', '1.0000');
    cy.get('[data-testid="evolutionary-rate-r-squared"]').should('have.text', '1.0000');
    cy.get('[data-testid="evolutionary-rate-statistics"]')
      .should('have.css', 'background-color', 'rgb(255, 255, 255)');
    cy.get('[data-testid="evolutionary-rate-residual-mean-squared"]').should('have.text', '0');
    cy.get(byTestId(testIds.evolutionaryRateCounts))
      .should('contain.text', '3 included')
      .and('contain.text', 'excluded');
  });

  it('persists table visibility and view-specific label, tooltip, size, and border settings', () => {
    chooseDateField();
    cy.contains('.nav-link', 'Appearance').click({ force: true });
    cy.contains('.p-togglebutton-label', 'Hide').click({ force: true });
    cy.closeSettingsPane('Evolutionary Rate Settings');
    cy.get(byTestId(testIds.evolutionaryRateStatistics)).should('not.exist');

    getEvolutionaryRateComponent().then((component) => {
      component.onTableVisibilityChange('Show');
      component.onNodeLabelVariableChange('_id');
      component.onNodeLabelOrientationChange('Top');
      component.onNodeTooltipVariableChange(['_id', DATE_FIELD]);
      component.onNodeRadiusChange(34);
      component.onNodeBorderWidthChange(5);
    });

    cy.get(byTestId(testIds.evolutionaryRateStatistics)).should('be.visible');
    cy.get('.evolutionary-rate-node-label').should('have.length', 3);
    cy.get('[data-testid="evolutionary-rate-point"]')
      .first()
      .should('have.attr', 'width', '34');
    cy.get('[data-testid="evolutionary-rate-point"]')
      .first()
      .should(($point) => {
        const markerSize = Number($point.attr('width'));
        const dataUri = String($point.attr('href') || '');
        const renderedStrokeWidth = getRenderedMarkerStrokeWidth(dataUri, markerSize);

        expect(renderedStrokeWidth, 'rendered marker border width').to.be.closeTo(5, 0.01);
      });
    cy.get('[data-testid="evolutionary-rate-point"]')
      .first()
      .trigger('mouseenter', { clientX: 300, clientY: 250, force: true });
    cy.get('[data-testid="evolutionary-rate-point"]').first().then(($point) => {
      cy.get('.evolutionary-rate-node-label').first().should(($label) => {
        const markerCenterY = Number($point.attr('y')) + (Number($point.attr('height')) / 2);
        expect(Number($label.attr('y')), 'top-oriented label y coordinate').to.be.lessThan(markerCenterY);
      });
    });
    cy.get('.evolutionary-rate-tooltip')
      .should('be.visible')
      .and('contain.text', DATE_FIELD);

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      expect(widgets['evolutionary-rate-table-visible']).to.equal('Show');
      expect(widgets['evolutionary-rate-node-label-variable']).to.equal('_id');
      expect(widgets['evolutionary-rate-node-label-orientation']).to.equal('Top');
      expect(widgets['evolutionary-rate-node-radius']).to.equal(34);
      expect(widgets['evolutionary-rate-node-border-width']).to.equal(5);
      expect(widgets['node-radius']).not.to.equal(34);
    });
  });

  it('downloads the statistics table and regression plot from the export dialog', () => {
    chooseDateField();
    cy.closeSettingsPane('Evolutionary Rate Settings');
    installSaveAsCaptureHook();

    cy.get('[data-testid="evolutionary-rate-export-button"]').click({ force: true });
    getVisibleDialog('Export Evolutionary Rate').as('evolutionaryRateExportDialog');
    cy.get('@evolutionaryRateExportDialog').find('[role="tab"]')
      .then(($headers) => {
        expect([...$headers].map(header => header.textContent?.trim())).to.deep.equal([
          'Regression Plot Image',
          'Statistics Table',
          'Outlier Report',
        ]);
      });
    cy.get('label[for="evolutionary-rate-plot-filename"]').should('have.text', 'Filename');

    cy.get('@evolutionaryRateExportDialog')
      .contains('[role="tab"]', 'Outlier Report')
      .click({ force: true });
    cy.get('label[for="evolutionary-rate-outlier-report-filename"]').should('have.text', 'Filename');
    cy.get('[data-testid="evolutionary-rate-outlier-report-filetype"]')
      .should('contain.text', 'PDF (.pdf)')
      .click({ force: true });
    cy.contains('li[role="option"]', 'Markdown (.md)').click({ force: true });
    cy.get('[data-testid="evolutionary-rate-outlier-report-summary"]')
      .should('contain.text', 'potential outliers')
      .and('contain.text', '2 times the residual RMSE');
    cy.get('[data-testid="evolutionary-rate-download-outlier-report"]').click({ force: true });

    cy.get('@evolutionaryRateExportDialog')
      .contains('[role="tab"]', 'Statistics Table')
      .click({ force: true });
    cy.get('label[for="evolutionary-rate-statistics-filename"]').should('have.text', 'Filename');
    cy.get('[data-testid="evolutionary-rate-download-table"]').click({ force: true });

    cy.get('@evolutionaryRateExportDialog')
      .contains('[role="tab"]', 'Regression Plot Image')
      .click({ force: true });
    cy.get('[data-testid="evolutionary-rate-plot-filetype"]').click({ force: true });
    cy.contains('li[role="option"]', 'jpeg').click({ force: true });
    cy.get('@evolutionaryRateExportDialog')
      .contains('p-accordion-header', 'Advanced')
      .click({ force: true });
    cy.get('[data-testid="evolutionary-rate-plot-scale"]')
      .clear()
      .type('1.5')
      .trigger('change');
    cy.get('[data-testid="evolutionary-rate-plot-resolution"]')
      .invoke('text')
      .should('match', /\d+\s+x\s+\d+/);
    cy.get('[data-testid="evolutionary-rate-plot-quality"]').should('be.visible');

    cy.get('[data-testid="evolutionary-rate-plot-filetype"]').click({ force: true });
    cy.contains('li[role="option"]', 'svg').click({ force: true });
    cy.get('[data-testid="evolutionary-rate-plot-scale"]').should('not.be.visible');
    cy.get('[data-testid="evolutionary-rate-download-plot"]').click({ force: true });

    cy.window().should((win: any) => {
      const downloads = win.__mtCapturedDownloads || [];
      const table = downloads.find((download: any) => download.fileName === 'evolutionary-rate-statistics.csv');
      const plot = downloads.find((download: any) => download.fileName === 'evolutionary-rate-regression.svg');
      const report = downloads.find((download: any) => download.fileName === 'evolutionary-rate-outlier-report.md');
      expect(table?.dataUrl).to.match(/^data:text\/csv/);
      expect(plot?.dataUrl).to.match(/^data:image\/svg\+xml/);
      expect(report?.dataUrl).to.match(/^data:text\/markdown/);
      const reportMarkdown = atob(String(report?.dataUrl || '').split(',')[1] || '');
      expect(reportMarkdown).to.contain('## Regression plot');
      expect(reportMarkdown).to.contain('data-testid="evolutionary-rate-regression-line"');
    });
  });

  it('responds to global colors and custom shapes, filters, metric changes, and session recall', () => {
    chooseDateField();
    cy.closeSettingsPane('Evolutionary Rate Settings');

    cy.get('[data-testid="evolutionary-rate-point"]').first().invoke('attr', 'href').then((initialHref) => {
      cy.window().then((win: any) => {
        const widgets = win.commonService.session.style.widgets;
        const component = win.commonService.visuals.evolutionaryRate;
        widgets['node-color-variable'] = 'None';
        widgets['node-color'] = '#123456';
        widgets['node-symbol-variable'] = 'None';
        widgets['node-symbol'] = 'ship';
        component.updateNodeColors();
        component.updateNodeShapes();
      });

      cy.get('[data-testid="evolutionary-rate-point"]')
        .first()
        .invoke('attr', 'href')
        .should('not.equal', initialHref)
        .and('contain', '%23123456');
    });

    cy.window().then((win: any) => {
      const visibleNodes = win.commonService.getVisibleNodes();
      visibleNodes.find((node: any) => node[DATE_FIELD] === '2022-01-01').visible = false;
      win.commonService.visuals.evolutionaryRate.onFilterDataChange();
    });
    cy.get('[data-testid="evolutionary-rate-point"]').should('have.length', 2);
    cy.get(byTestId(testIds.evolutionaryRateCounts)).should('contain.text', '2 included');

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const component = win.commonService.visuals.evolutionaryRate;
      widgets['default-distance-metric'] = 'tn93';
      const visibleNodes = win.commonService.getVisibleNodes();
      const datedNodes = visibleNodes
        .filter((node: any) => node[DATE_FIELD] && node[DATE_FIELD] !== '2020-02-30')
        .sort((a: any, b: any) => String(a[DATE_FIELD]).localeCompare(String(b[DATE_FIELD])));
      datedNodes.slice(1).forEach((node: any, index: number) => {
        const sourceId = String(datedNodes[0]._id ?? datedNodes[0].id);
        const targetId = String(node._id ?? node.id);
        const link = win.commonService.temp.matrix?.[sourceId]?.[targetId]
          ?? win.commonService.temp.matrix?.[targetId]?.[sourceId];
        link.distance = (index + 1) * 0.02;
      });
      widgets['tn93-distance-display-format'] = 'percentage';
      component.updateVisualization();
    });
    cy.get('[data-testid="evolutionary-rate-y-axis-title"]').should('have.text', 'Genetic Distance (TN93)');
    cy.get('[data-testid="evolutionary-rate-slope"]').should('have.text', '2');

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const component = win.commonService.visuals.evolutionaryRate;
      widgets['evolutionary-rate-table-visible'] = 'Hide';
      widgets['evolutionary-rate-date-field'] = DATE_FIELD;
      component.onRecallSession();
    });

    cy.get('[data-testid="evolutionary-rate-y-axis-title"]').should('have.text', 'Genetic Distance (TN93)');
    cy.get('[data-testid="evolutionary-rate-slope"]').should('not.exist');
    cy.get(byTestId(testIds.evolutionaryRateStatistics)).should('not.exist');
    getEvolutionaryRateComponent().should((component) => {
      expect(component.selectedDateField).to.equal(DATE_FIELD);
      expect(component.selectedTableVisibility).to.equal('Hide');
      expect(component.distanceSourceLabel).to.contain('TN93 distance from earliest dated sample');
    });
  });

  it('uses root-to-tip patristic distance when the data source is a phylogenetic tree', () => {
    chooseDateField();
    cy.closeSettingsPane('Evolutionary Rate Settings');

    cy.window().then((win: any) => {
      const datedNodes = win.commonService.getVisibleNodes()
        .filter((node: any) => node[DATE_FIELD] && node[DATE_FIELD] !== '2020-02-30')
        .sort((a: any, b: any) => String(a[DATE_FIELD]).localeCompare(String(b[DATE_FIELD])))
        .slice(0, 3);
      const labels = datedNodes.map((node: any) => String(node._id ?? node.id));
      win.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
      win.commonService.session.style.widgets['tn93-distance-display-format'] = 'percentage';
      win.commonService.session.data.newickString = `(${labels[0]}:1,${labels[1]}:2,${labels[2]}:4);`;
      win.commonService.session.data.newickSource = 'newick';
      win.commonService.visuals.evolutionaryRate.updateVisualization();
    });

    cy.get('[data-testid="evolutionary-rate-y-axis-title"]', { timeout: 10000 })
      .should('have.text', 'Patristic Distance');
    cy.get('[data-testid="evolutionary-rate-point"]').should('have.length', 3);
    cy.get('[data-testid="evolutionary-rate-slope"]').should('have.text', '1.5');

    cy.get('[data-testid="evolutionary-rate-settings-button"]').click({ force: true });
    getVisibleDialog('Evolutionary Rate Settings');
    cy.get('[data-testid="evolutionary-rate-detected-field"]')
      .should('contain.text', 'Patristic root-to-tip distance');
    cy.get('[data-testid="evolutionary-rate-root-method"]')
      .should('exist')
      .within(() => {
        cy.contains('.p-togglebutton-label', 'Best fit').click({ force: true });
      });
    cy.closeSettingsPane('Evolutionary Rate Settings');

    cy.get('[data-testid="evolutionary-rate-slope"]', { timeout: 10000 }).should('have.text', '2');
    cy.get('[data-testid="evolutionary-rate-residual-mean-squared"]')
      .invoke('text')
      .then((text) => {
        expect(Number(text.trim()), 'best-fit residual mean squared').to.be.lessThan(1e-12);
      });
    cy.window().its('commonService.session.style.widgets.evolutionary-rate-root-method')
      .should('equal', 'best-fit');
  });
});
