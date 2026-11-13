/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { launchProfileToHeatmap, openGlobalStylingTab, openHeatmapSettingsDialog, visitAppAndAcceptEula } from '../../../support/journey-helpers';

function assertColorCommit(selector: string, ownerName: 'microbeTrace' | 'heatmap', method: string, widget: string, color: string): void {
  cy.window().then((win: any) => {
    const common = win.commonService;
    const owner = common.visuals[ownerName];
    const before = common.session.style.widgets[widget];
    const redraw = cy.spy(owner, method);
    cy.get(selector).scrollIntoView().should('be.visible').then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      for (let index = 0; index < 40; index++) {
        input.value = index % 2 ? '#112233' : '#aabbcc';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      expect(redraw, 'no view update during picker dragging').not.to.have.been.called;
      expect(common.session.style.widgets[widget], 'no saved color changes during dragging').to.equal(before);
      input.value = color;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    cy.then(() => {
      expect(redraw, 'one update after selection').to.have.been.calledOnce;
      expect(common.session.style.widgets[widget]).to.equal(color);
      redraw.restore();
    });
  });
}

function selectOption(selector: string, label: string): void {
  cy.get(selector).click();
  cy.contains('.p-select-overlay:visible li[role="option"]', label).click();
}

describe('Color pickers commit once after selection', () => {
  it('defers global node, link, selection, and background color updates until change', () => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      app.SelectedColorNodesByVariable = 'None';
      app.onColorNodesByChanged();
      app.SelectedColorLinksByVariable = 'None';
      app.onColorLinksByChanged();
    });
    openGlobalStylingTab();
    assertColorCommit('#node-color', 'microbeTrace', 'onNodeColorChanged', 'node-color', '#123456');
    assertColorCommit('#link-color', 'microbeTrace', 'onLinkColorChanged', 'link-color', '#234567');
    assertColorCommit('#selected-color', 'microbeTrace', 'onSelectedColorChanged', 'selected-color', '#345678');
    assertColorCommit('#background-color', 'microbeTrace', 'onBackgroundChanged', 'background-color', '#456789');
  });

  it('defers heatmap stop, missing-data, and categorical colors until change', () => {
    const profile: DatasetProfile = {
      id: 'heatmap-color-commit', title: 'Heatmap color commits', tags: ['heatmap'],
      files: [{ name: 'Heatmap_Custom_HI_Node.csv', datatype: 'node', field1: 'row_id', field2: 'None' }],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' }, expectations: {},
    };
    launchProfileToHeatmap(profile);
    openHeatmapSettingsDialog();
    selectOption('#heatmap-data-layout', 'One cell value per record (long)');
    cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click();
    cy.get('@heatmapSettings').contains('.p-accordionheader', 'Color').click();
    assertColorCommit('#heatmap-continuous-color-editor .continuous-ramp__stop-row:first input[type="color"]', 'heatmap', 'updateColorScale', 'heatmap-color-low', '#123456');
    assertColorCommit('#missing-color', 'heatmap', 'updateMissingColor', 'heatmap-color-missing', '#654321');
    cy.get('@heatmapSettings').contains('.nav-link', 'Configuration').click();
    selectOption('#heatmap-value-variable', 'Phenotype');
    cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click();
    assertColorCommit('#low-color', 'heatmap', 'updateLoColor', 'heatmap-color-low', '#234567');
    assertColorCommit('#med-color', 'heatmap', 'updateMedColor', 'heatmap-color-medium', '#345678');
    assertColorCommit('#hi-color', 'heatmap', 'updateHiColor', 'heatmap-color-high', '#456789');
    cy.get('#heatmap').should('have.css', 'border-top-width', '0px');
  });
});
