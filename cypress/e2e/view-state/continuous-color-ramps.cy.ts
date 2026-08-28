/// <reference types="cypress" />

import { visitAppAndAcceptEula } from '../../support/journey-helpers';
import { selectEpiCurveDropdown } from '../../support/epi-curve-helpers';

const launchSample = (): void => {
  visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
  cy.window().its('commonService.session.data.nodes').should('have.length.greaterThan', 0);
};

const useNodeColorField = (field: string): void => {
  cy.window().then((win: any) => {
    const app = win.commonService.visuals.microbeTrace;
    app.SelectedColorNodesByVariable = field;
    app.onColorNodesByChanged();
  });
};

const useLinkColorField = (field: string): void => {
  cy.window().then((win: any) => {
    const app = win.commonService.visuals.microbeTrace;
    app.SelectedColorLinksByVariable = field;
    app.onColorLinksByChanged();
  });
};

describe('Continuous numeric color ramps', () => {
  beforeEach(() => {
    launchSample();
  });

  it('uses a full-data node ramp, renders a docked legend, and restores categorical history', () => {
    useNodeColorField('degree');

    cy.window().should((win: any) => {
      const common = win.commonService;
      const resolved = common.temp.style.nodeColorScale;
      const allDegrees = common.session.data.nodes.map((node: any) => Number(node.degree));

      expect(resolved.mode).to.equal('continuous');
      expect(resolved.requestedMode).to.equal('auto');
      expect(resolved.domain.min).to.equal(Math.min(...allDegrees));
      expect(resolved.domain.max).to.equal(Math.max(...allDegrees));
      expect(resolved.colorMap(resolved.domain.min)).not.to.equal(resolved.colorMap(resolved.domain.max));
      expect(resolved.colorMap('not numeric').toLowerCase()).to.equal('#eae553');
    });

    cy.get('#key-tables-node-legend', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-node-legend [data-testid="continuous-color-gradient"]')
      .should('have.attr', 'role', 'img')
      .and('have.attr', 'aria-label')
      .and('contain', 'Continuous color ramp');
    cy.get('#key-tables-node-legend').should('contain.text', 'Missing / invalid');
    cy.get('#key-tables-node-table').should('not.exist');

    cy.get('[data-testid="key-tables-node-color-ramp-edit"]')
      .should('have.attr', 'aria-label', 'Edit node color ramp')
      .click();
    cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings').should('be.visible');
    cy.get('#node-continuous-color-editor').scrollIntoView().should('be.visible');
    cy.focused().should('have.id', 'node-continuous-color-editor-domain-kind');
    cy.get('#key-tables-node-legend').should('be.visible');
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      const common = win.commonService;
      app.onVariableColorModeChanged('node', 'categorical');
      const savedHistory = JSON.stringify(common.session.style.nodeColorsTableHistory.degree);
      expect(savedHistory).to.not.equal('{}');

      app.onVariableColorModeChanged('node', 'continuous');
      expect(JSON.stringify(common.session.style.nodeColorsTableHistory.degree)).to.equal(savedHistory);

      app.onVariableColorModeChanged('node', 'categorical');
      expect(JSON.stringify(common.session.style.nodeColorsTableHistory.degree)).to.equal(savedHistory);
      const firstNode = common.session.data.nodes[0];
      expect(common.temp.style.nodeColorMap(firstNode.degree))
        .to.equal(common.session.style.nodeColorsTableHistory.degree[String(firstNode.degree)]);
    });

    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');
  });

  it('applies custom arbitrary stops to links while keeping the domain stable across visibility changes', () => {
    useLinkColorField('distance');

    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      app.onVariableColorConfigChanged('link', {
        mode: 'continuous',
        domain: { kind: 'custom', min: 0, max: 20 },
        stops: [
          { value: 0, color: '#000000' },
          { value: 4, color: '#ff0000' },
          { value: 20, color: '#ffffff' },
        ],
        missingColor: '#123456',
      });
    });

    cy.window().should((win: any) => {
      const common = win.commonService;
      const before = common.temp.style.linkColorScale;
      expect(before.domain).to.deep.equal({ min: 0, max: 20 });
      expect(before.stops.map((stop: any) => stop.value)).to.deep.equal([0, 4, 20]);
      expect(before.colorMap(-10).replace(/\s/g, '')).to.match(/rgb\(0,0,0\)|#000000/);
      expect(before.colorMap(100).replace(/\s/g, '')).to.match(/rgb\(255,255,255\)|#ffffff/);
      expect(before.colorMap('invalid')).to.equal('#123456');

      common.session.data.links.slice(0, 5).forEach((link: any) => { link.visible = false; });
      common.createLinkColorMap();
      expect(common.temp.style.linkColorScale.domain).to.deep.equal({ min: 0, max: 20 });
    });

    cy.get('#key-tables-link-legend', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-link-legend [data-testid="continuous-color-gradient"]')
      .should('have.attr', 'aria-label')
      .and('contain', '0 #000000')
      .and('contain', '4 #ff0000')
      .and('contain', '20 #ffffff');

    cy.openGlobalSettings();
    cy.get('#link-color-table-row', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible')
      .contains('.p-togglebutton-label', 'Show')
      .click({ force: true });
    cy.closeGlobalSettings();

    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="floating-link-color-ramp-edit"]')
      .should('have.attr', 'aria-label', 'Edit link color ramp')
      .click();
    cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings').should('be.visible');
    cy.get('#link-continuous-color-editor').scrollIntoView().should('be.visible');
    cy.focused().should('have.id', 'link-continuous-color-editor-domain-kind');
    cy.get('#global-settings-link-color-table').should('be.visible');
  });

  it('uses fixed equal-width continuous Node Color bins in the Epi Curve', () => {
    useNodeColorField('degree');

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Epi Curve').click();
    cy.get('#epiCurve', { timeout: 15000 }).should('be.visible');

    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    selectEpiCurveDropdown('Color By', 'Node Color');

    cy.get('#epi-continuous-bin-count', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible')
      .clear()
      .type('7')
      .trigger('change');

    cy.window().then((win: any) => {
      expect(win.commonService.visuals.epiCurve.widgets['epiCurve-continuousBinCount']).to.equal(7);
    });

    cy.get('#epi-continuous-bin-count', { timeout: 15000 })
      .should('be.visible')
      .and('have.value', '7');
    cy.get('#epi-stack-order-list').should('not.exist');
    cy.get('#epiCurveSVG .epiCurve-epi-curve text')
      .invoke('text')
      .should('match', /\[[^\]]+,\s*[^\]]+[\)\]]/);

    cy.window().should((win: any) => {
      const epi = win.commonService.visuals.epiCurve;
      expect(epi.widgets['epiCurve-continuousBinCount']).to.equal(7);
      epi.widgets['epiCurve-cumulative'] = true;
      epi.setCumulative();
      expect(epi.widgets['epiCurve-continuousBinCount']).to.equal(7);
    });
  });
});
