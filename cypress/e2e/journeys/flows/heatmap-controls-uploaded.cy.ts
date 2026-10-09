/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertHeatmapMatchesBackingMatrix,
  goToHeatmapView,
  launchProfileToHeatmap,
  openHeatmapSettingsDialog,
} from '../../../support/journey-helpers';

type HeatmapAccordionPanel = 'heatmap-invert' | 'heatmap-labels' | 'heatmap-color';
type HeatmapImageFileType = 'png' | 'jpeg' | 'svg';

function openHeatmapAccordion(panelValue: HeatmapAccordionPanel): void {
  cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click({ force: true });
  cy.get('@heatmapSettings')
    .find(`p-accordion-panel[value="${panelValue}"] .p-accordionheader`)
    .first()
    .then(($header) => {
      if ($header.attr('aria-expanded') !== 'true') {
        cy.wrap($header).click({ force: true });
      }
    });
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

function exportHeatmapImage(fileBase: string, fileType: HeatmapImageFileType): void {
  cy.get('@heatmapExportDialog')
    .find('#tree-image-filename')
    .clear()
    .type(fileBase);

  setHeatmapExportFileType(fileType);
  cy.get('@heatmapExportDialog').find('#export-tree').click({ force: true });
}

function captureHeatmapDownloadBlobs(): void {
  cy.window().then((win: any) => {
    const originalCreateObjectURL = win.URL.createObjectURL.bind(win.URL);
    win.__lastSavedBlob = null;

    cy.stub(win.URL, 'createObjectURL').callsFake((blob: Blob) => {
      win.__lastSavedBlob = blob;
      return originalCreateObjectURL(blob);
    }).as('heatmapCreateObjectUrl');
  });
}

function assertCapturedHeatmapCsvMatchesRendered(includeLabels: boolean): void {
  cy.window().then((win: any) => {
    const trace = win.commonService.visuals.heatmap.heatmapData[0];
    const csvBlob = win.__lastSavedBlob as Blob | null;
    const expectedX = (trace.x || []).map((value: unknown) => String(value));
    const expectedY = (trace.y || []).map((value: unknown) => String(value));
    const expectedZ = (trace.z || []).map((row: unknown[]) => row.map((value) => String(value)));

    expect(csvBlob, 'captured heatmap CSV blob').to.exist;
    expect(csvBlob?.type || '', 'captured heatmap CSV blob type').to.contain('text/csv');

    return csvBlob!.text().then((csvText: string) => {
      const payload = csvText.startsWith('data:text/csv;charset=utf-8,')
        ? csvText.slice('data:text/csv;charset=utf-8,'.length)
        : csvText;
      const rows = payload.trim().split(/\r?\n/).map((row) => row.split(','));

      if (includeLabels) {
        expect(rows[0], 'exported heatmap CSV header labels').to.deep.equal(['', ...expectedX]);
        expect(rows.slice(1).map((row) => row[0]), 'exported heatmap CSV row labels').to.deep.equal(expectedY);
        expect(rows.slice(1).map((row) => row.slice(1)), 'exported heatmap CSV values').to.deep.equal(expectedZ);
        return;
      }

      expect(rows, 'exported heatmap CSV values').to.deep.equal(expectedZ);
    });
  });
}

function zoomHeatmapViewport(): void {
  cy.window().then((win: any) => {
    const graphDiv = win.document.getElementById('heatmap') as any;
    const labelCount = Number(win.commonService.visuals.heatmap.heatmapData?.[0]?.x?.length || 0);
    const zoomEnd = Math.max(1, Math.min(labelCount - 0.5, Math.ceil(labelCount / 2)));
    graphDiv.layout = graphDiv.layout || {};
    graphDiv.layout.xaxis = {
      ...(graphDiv.layout.xaxis || {}),
      range: [-0.25, zoomEnd],
    };
    graphDiv.layout.yaxis = {
      ...(graphDiv.layout.yaxis || {}),
      range: [-0.25, zoomEnd],
    };
    graphDiv._fullLayout.xaxis.autorange = false;
    graphDiv._fullLayout.yaxis.autorange = false;

    expect(graphDiv?._fullLayout?.xaxis?.autorange, 'zoomed heatmap x-axis autorange').to.equal(false);
    expect(graphDiv?._fullLayout?.yaxis?.autorange, 'zoomed heatmap y-axis autorange').to.equal(false);
  });
}

describe('Journey Flow - Heatmap controls and export on uploaded data', () => {
  const profile = getProfile('heatmap-tn93-matrix');

  it('updates axis inversion and label visibility from Heatmap Settings', () => {
    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);
    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: false,
    });

    openHeatmapSettingsDialog();

    openHeatmapAccordion('heatmap-invert');
    setSelectButtonValue('#x-invert', 'Yes');
    cy.window().its('commonService.session.style.widgets.heatmap-invertX').should('equal', true);
    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      labelsVisible: false,
    });

    setSelectButtonValue('#y-invert', 'Yes');
    cy.window().its('commonService.session.style.widgets.heatmap-invertY').should('equal', true);
    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: false,
    });

    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    cy.window().its('commonService.session.style.widgets.heatmap-axislabels-show').should('equal', true);
    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: true,
    });

    cy.closeSettingsPane('Heatmap Settings');
    openHeatmapSettingsDialog();
    cy.window().its('commonService.session.style.widgets.heatmap-axislabels-show').should('equal', true);
    cy.closeSettingsPane('Heatmap Settings');
  });

  it('re-centers the Heatmap after a manual viewport change', () => {
    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);
    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: false,
    });

    zoomHeatmapViewport();

    cy.get('heatmapcomponent #tool-btn-container a[title="Center Screen"]:visible').click({ force: true });

    cy.window().should((win: any) => {
      const graphDiv = win.document.getElementById('heatmap') as any;
      expect(Boolean(graphDiv?._fullLayout?.xaxis?.autorange), 'centered heatmap x-axis autorange').to.equal(true);
      expect(Boolean(graphDiv?._fullLayout?.yaxis?.autorange), 'centered heatmap y-axis autorange').to.equal(true);
    });

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: false,
    });
  });

  it('updates the color scale and exports SVG, PNG, and JPEG artifacts', () => {
    const exportFileBase = `cypress_heatmap_export_${Date.now()}`;
    const svgPath = `cypress/downloads/${exportFileBase}.svg`;
    const pngPath = `cypress/downloads/${exportFileBase}.png`;
    const jpegPath = `cypress/downloads/${exportFileBase}.jpeg`;
    const colors = {
      low: '#112233',
      medium: '#445566',
      high: '#778899',
    };

    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);

    openHeatmapSettingsDialog();

    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    cy.window().its('commonService.session.style.widgets.heatmap-axislabels-show').should('equal', true);

    openHeatmapAccordion('heatmap-color');
    setColorInput('#low-color', colors.low);
    cy.window().its('commonService.session.style.widgets.heatmap-color-low').should('equal', colors.low);
    setColorInput('#med-color', colors.medium);
    cy.window().its('commonService.session.style.widgets.heatmap-color-medium').should('equal', colors.medium);
    setColorInput('#hi-color', colors.high);
    cy.window().its('commonService.session.style.widgets.heatmap-color-high').should('equal', colors.high);

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      labelsVisible: true,
      colors,
    });

    cy.closeSettingsPane('Heatmap Settings');
    openHeatmapExportDialog();

    exportHeatmapImage(exportFileBase, 'svg');
    cy.readFile(svgPath, 'utf8', { timeout: 30000 }).should((svgText) => {
      expect(svgText, 'exported heatmap SVG content').to.include('<svg');
      expect(svgText.length, 'exported heatmap SVG length').to.be.greaterThan(100);
    });

    exportHeatmapImage(exportFileBase, 'png');
    cy.readFile(pngPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'exported heatmap PNG byte length').to.be.greaterThan(1000);
    });

    exportHeatmapImage(exportFileBase, 'jpeg');
    cy.readFile(jpegPath, 'binary', { timeout: 30000 }).should((jpegBinary) => {
      expect(jpegBinary.length, 'exported heatmap JPEG byte length').to.be.greaterThan(1000);
    });
  });

  it('exports distance-matrix CSV artifacts for the active labeled and unlabeled Heatmap states', () => {
    const labeledMatrixFileName = `cypress_heatmap_matrix_labeled_${Date.now()}.csv`;
    const unlabeledMatrixFileName = `cypress_heatmap_matrix_unlabeled_${Date.now()}.csv`;

    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);
    captureHeatmapDownloadBlobs();

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-invert');
    setSelectButtonValue('#x-invert', 'Yes');
    setSelectButtonValue('#y-invert', 'Yes');
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    cy.closeSettingsPane('Heatmap Settings');

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: true,
    });

    openHeatmapExportDialog();
    cy.get('@heatmapExportDialog')
      .find('#distance-matrix-filename')
      .invoke('val', labeledMatrixFileName)
      .trigger('input')
      .trigger('change');
    cy.window()
      .its('commonService.visuals.heatmap.SelectedDistanceMatrixFilenameVariable')
      .should('equal', labeledMatrixFileName);
    cy.get('@heatmapExportDialog').find('#export-distance-matrix').click({ force: true });
    assertCapturedHeatmapCsvMatchesRendered(true);
    cy.closeSettingsPane('Export Heatmap');

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'No');
    cy.closeSettingsPane('Heatmap Settings');

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: false,
    });

    openHeatmapExportDialog();
    cy.get('@heatmapExportDialog')
      .find('#distance-matrix-filename')
      .invoke('val', unlabeledMatrixFileName)
      .trigger('input')
      .trigger('change');
    cy.window()
      .its('commonService.visuals.heatmap.SelectedDistanceMatrixFilenameVariable')
      .should('equal', unlabeledMatrixFileName);
    cy.get('@heatmapExportDialog').find('#export-distance-matrix').click({ force: true });
    assertCapturedHeatmapCsvMatchesRendered(false);
  });

  it('reapplies persisted Heatmap settings after closing and reopening the tab', () => {
    const colors = {
      low: '#a61c3c',
      medium: '#f4a261',
      high: '#2a9d8f',
    };

    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);

    openHeatmapSettingsDialog();
    openHeatmapAccordion('heatmap-invert');
    setSelectButtonValue('#x-invert', 'Yes');
    setSelectButtonValue('#y-invert', 'Yes');
    openHeatmapAccordion('heatmap-labels');
    setSelectButtonValue('#show-labels', 'Yes');
    openHeatmapAccordion('heatmap-color');
    setColorInput('#low-color', colors.low);
    setColorInput('#med-color', colors.medium);
    setColorInput('#hi-color', colors.high);
    cy.closeSettingsPane('Heatmap Settings');

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: true,
      colors,
    });

    cy.get('.lm_tab[title="Heatmap"]>.lm_close_tab', { timeout: 15000 }).click({ force: true });
    cy.get('#heatmap', { timeout: 15000 }).should('not.exist');

    goToHeatmapView();

    cy.window().its('commonService.session.style.widgets.heatmap-invertX').should('equal', true);
    cy.window().its('commonService.session.style.widgets.heatmap-invertY').should('equal', true);
    cy.window().its('commonService.session.style.widgets.heatmap-axislabels-show').should('equal', true);
    cy.window().its('commonService.session.style.widgets.heatmap-color-low').should('equal', colors.low);
    cy.window().its('commonService.session.style.widgets.heatmap-color-medium').should('equal', colors.medium);
    cy.window().its('commonService.session.style.widgets.heatmap-color-high').should('equal', colors.high);

    assertHeatmapMatchesBackingMatrix({
      metric: profile.preLaunch.metric,
      invertX: true,
      invertY: true,
      labelsVisible: true,
      colors,
    });
  });
});
