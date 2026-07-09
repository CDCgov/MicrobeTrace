/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import {
  assertHeatmapReady,
  ensureHeatmapView,
  launchProfileToHeatmap,
  openHeatmapSettingsDialog,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

type HeatmapImageFileType = 'png' | 'jpeg' | 'svg';

const nodeProfile: DatasetProfile = {
  id: 'heatmap-custom-hi-node',
  title: 'Heatmap: custom HI node rows render selected X/Y/value fields',
  tags: ['heatmap', 'custom-config', 'node'],
  files: [
    {
      name: 'Heatmap_Custom_HI_Node.csv',
      datatype: 'node',
      field1: 'row_id',
      field2: 'None',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expectations: {},
};

const linkProfile: DatasetProfile = {
  id: 'heatmap-custom-assay-link',
  title: 'Heatmap: custom link rows render selected value field',
  tags: ['heatmap', 'custom-config', 'link'],
  files: [
    {
      name: 'Heatmap_Custom_Assay_Links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
      field3: 'None',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expectations: {},
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openHeatmapConfigurationTab(): void {
  cy.get('@heatmapSettings').contains('.nav-link', 'Configuration').click({ force: true });
}

function openHeatmapAppearanceTab(): void {
  cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click({ force: true });
}

function openHeatmapAccordion(panelValue: 'heatmap-labels' | 'heatmap-color'): void {
  openHeatmapAppearanceTab();
  cy.get('@heatmapSettings')
    .find(`p-accordion-panel[value="${panelValue}"] .p-accordionheader`)
    .first()
    .then(($header) => {
      if ($header.attr('aria-expanded') !== 'true') {
        cy.wrap($header).click({ force: true });
      }
    });
}

function selectHeatmapOption(selectId: string, optionLabel: string): void {
  cy.get('@heatmapSettings').find(selectId).click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${escapeForRegex(optionLabel)}$`), { timeout: 15000 })
    .click({ force: true });
}

function setSelectButtonValue(controlSelector: string, value: 'Yes' | 'No'): void {
  const targetIndex = value === 'Yes' ? 0 : 1;

  cy.get('@heatmapSettings')
    .find(controlSelector)
    .find('p-togglebutton')
    .eq(targetIndex)
    .click({ force: true });
}

function setColorInput(inputSelector: string, color: string): void {
  cy.get('@heatmapSettings').find(inputSelector).then(($input) => {
    const input = $input.get(0) as HTMLInputElement;
    input.value = color;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function configureNodeHeatmap(options: {
  sortBy?: string;
  value: string;
}): void {
  openHeatmapSettingsDialog();
  openHeatmapConfigurationTab();
  selectHeatmapOption('#heatmap-x-variable', 'Serum');
  selectHeatmapOption('#heatmap-y-variable', 'Isolate ID');
  selectHeatmapOption('#heatmap-value-variable', options.value);

  if (options.sortBy) {
    selectHeatmapOption('#heatmap-sort-by', options.sortBy);
  }

  cy.closeSettingsPane('Heatmap Settings');
  assertHeatmapReady();
}

function openHeatmapExportDialog(): void {
  cy.get('heatmapcomponent #tool-btn-container a[title="Export Screen"]:visible').click({ force: true });
  cy.contains('.p-dialog-title', 'Export Heatmap')
    .should('be.visible')
    .parents('.p-dialog')
    .as('heatmapExportDialog');
}

function setHeatmapExportFileType(fileType: HeatmapImageFileType): void {
  cy.get('@heatmapExportDialog').find('#network-export-filetype').click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${fileType}$`, 'i')).click({ force: true });
}

function captureHeatmapDownloadBlobs(): void {
  cy.window().then((win: any) => {
    const originalCreateObjectURL = win.URL.createObjectURL.bind(win.URL);
    win.__lastSavedBlob = null;

    cy.stub(win.URL, 'createObjectURL').callsFake((blob: Blob) => {
      win.__lastSavedBlob = blob;
      return originalCreateObjectURL(blob);
    }).as('customHeatmapCreateObjectUrl');
  });
}

function assertCapturedCsvRows(expectedRows: string[][]): void {
  cy.window().then((win: any) => {
    const csvBlob = win.__lastSavedBlob as Blob | null;

    expect(csvBlob, 'captured heatmap CSV blob').to.exist;
    return csvBlob!.text().then((csvText: string) => {
      const rows = csvText.trim().split(/\r?\n/).map((row) => row.split(','));
      expect(rows, 'custom heatmap CSV rows').to.deep.equal(expectedRows);
    });
  });
}

describe('Journey Flow - Custom Heatmap configuration on uploaded data', () => {
  it('renders node-backed numeric values with sorting, missing color, duplicate warning, and configured export', () => {
    const missingColor = '#123456';

    launchProfileToHeatmap(nodeProfile);
    configureNodeHeatmap({
      value: 'HI Titer',
      sortBy: 'Sort Order',
    });

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    openHeatmapAccordion('heatmap-color');
    setColorInput('#missing-color', missingColor);
    cy.closeSettingsPane('Heatmap Settings');

    cy.window().should((win: any) => {
      const heatmap = win.commonService.visuals.heatmap;
      const trace = heatmap.heatmapData[0];
      const missingTrace = heatmap.heatmapData[1];
      const duplicateWarning = win.commonService.session.warnings
        .find((warning: any) => warning.id === 'heatmap-duplicate-cells');

      expect(win.commonService.session.style.widgets['heatmap-x-variable']).to.equal('Serum');
      expect(win.commonService.session.style.widgets['heatmap-y-variable']).to.equal('Isolate ID');
      expect(win.commonService.session.style.widgets['heatmap-value-source']).to.equal('node');
      expect(win.commonService.session.style.widgets['heatmap-value-variable']).to.equal('HI_Titer');
      expect(win.commonService.session.style.widgets['heatmap-sort-by']).to.equal('Sort_Order');
      expect(win.commonService.session.style.widgets['heatmap-summary-statistic']).to.equal('None');
      expect(win.commonService.session.style.widgets['heatmap-color-missing']).to.equal(missingColor);

      expect(trace.x, 'node-backed sorted x labels').to.deep.equal(['S2', 'S1']);
      expect(trace.y, 'node-backed sorted y labels').to.deep.equal(['Virus B', 'Virus A']);
      expect(trace.z, 'node-backed numeric z values').to.deep.equal([
        [20, 80],
        [null, 40],
      ]);
      expect(trace.colorbar.ticktext, 'node-backed numeric legend labels').to.include.members(['20', '40', '80']);
      expect(trace.colorbar.ticktext, 'node-backed numeric legend excludes literal null').to.not.include('null');
      expect(trace.colorbar.y, 'node-backed colorbar is lowered when No Data legend is present').to.be.lessThan(0.5);
      expect(missingTrace.name, 'missing trace legend label').to.equal('No Data');
      expect(missingTrace.legendrank, 'missing trace legend order').to.equal(0);
      expect(missingTrace.colorscale, 'missing trace colorscale').to.deep.equal([
        [0, missingColor],
        [1, missingColor],
      ]);
      expect(duplicateWarning?.duplicateCount, 'duplicate heatmap cells').to.equal(1);
    });

    captureHeatmapDownloadBlobs();
    openHeatmapExportDialog();
    cy.get('@heatmapExportDialog')
      .find('#distance-matrix-filename')
      .clear({ force: true })
      .type('custom_heatmap_matrix.csv', { force: true });
    setHeatmapExportFileType('png');
    cy.get('@heatmapExportDialog').find('#export-distance-matrix').click({ force: true });

    assertCapturedCsvRows([
      ['', 'S2', 'S1'],
      ['Virus B', '20', '80'],
      ['Virus A', '', '40'],
    ]);
  });

  it('renders node-backed categorical values with categorical legend labels', () => {
    launchProfileToHeatmap(nodeProfile);
    configureNodeHeatmap({
      value: 'Phenotype',
    });

    cy.window().should((win: any) => {
      const heatmap = win.commonService.visuals.heatmap;
      const trace = heatmap.heatmapData[0];
      const duplicateWarning = win.commonService.session.warnings
        .find((warning: any) => warning.id === 'heatmap-duplicate-cells');

      expect(trace.x, 'categorical x labels').to.deep.equal(['S1', 'S2']);
      expect(trace.y, 'categorical y labels').to.deep.equal(['Virus A', 'Virus B']);
      expect(trace.z, 'categorical z values').to.deep.equal([
        [0, null],
        [1, 0],
      ]);
      expect(trace.colorbar.ticktext, 'categorical legend labels').to.deep.equal(['Low', 'Medium']);
      expect(trace.colorbar.ticktext, 'categorical legend excludes literal null').to.not.include('null');
      expect(heatmap.heatmapData[1]?.name, 'categorical missing trace').to.equal('No Data');
      expect(duplicateWarning?.duplicateCount, 'categorical duplicate heatmap cells').to.equal(1);
    });
  });

  it('renders link-backed custom values using source and target axes', () => {
    launchProfileToHeatmap(linkProfile);

    openHeatmapSettingsDialog();
    openHeatmapConfigurationTab();
    selectHeatmapOption('#heatmap-value-variable', 'AssayScore');
    cy.closeSettingsPane('Heatmap Settings');
    assertHeatmapReady();

    cy.window().should((win: any) => {
      const heatmap = win.commonService.visuals.heatmap;
      const trace = heatmap.heatmapData[0];
      const missingTrace = heatmap.heatmapData[1];

      expect(win.commonService.session.style.widgets['heatmap-value-source']).to.equal('link');
      expect(win.commonService.session.style.widgets['heatmap-value-variable']).to.equal('AssayScore');
      expect(trace.x, 'link-backed x labels').to.deep.equal(['Virus A', 'Virus B']);
      expect(trace.y, 'link-backed y labels').to.deep.equal(['Serum 1', 'Serum 2']);
      expect(trace.z, 'link-backed z values').to.deep.equal([
        [5, 3],
        [null, null],
      ]);
      expect(missingTrace.name, 'link-backed missing trace').to.equal('No Data');
    });
  });

  it('restores custom Heatmap configuration and missing-data color after a session round trip', () => {
    const sessionFileBase = `cypress_heatmap_custom_session_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;
    const missingColor = '#654321';

    launchProfileToHeatmap(nodeProfile);
    configureNodeHeatmap({
      value: 'HI Titer',
      sortBy: 'Sort Order',
    });

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-color');
    setColorInput('#missing-color', missingColor);
    cy.closeSettingsPane('Heatmap Settings');

    saveSessionFromFileMenu(sessionFileBase);
    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved custom Heatmap session').to.include('"heatmap-value-source":"node"');
      expect(savedSession, 'saved custom Heatmap missing color').to.include(`"heatmap-color-missing":"${missingColor}"`);
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(30000);
    ensureHeatmapView();

    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const trace = win.commonService.visuals.heatmap.heatmapData[0];

      expect(widgets['heatmap-x-variable']).to.equal('Serum');
      expect(widgets['heatmap-y-variable']).to.equal('Isolate ID');
      expect(widgets['heatmap-value-source']).to.equal('node');
      expect(widgets['heatmap-value-variable']).to.equal('HI_Titer');
      expect(widgets['heatmap-sort-by']).to.equal('Sort_Order');
      expect(widgets['heatmap-color-missing']).to.equal(missingColor);
      expect(trace.x, 'restored custom x labels').to.deep.equal(['S2', 'S1']);
      expect(trace.y, 'restored custom y labels').to.deep.equal(['Virus B', 'Virus A']);
      expect(trace.z, 'restored custom z values').to.deep.equal([
        [20, 80],
        [null, 40],
      ]);
    });
  });
});
