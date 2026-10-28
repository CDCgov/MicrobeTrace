/// <reference types="cypress" />

import { createFieldOptionValue, INTERNAL_FIELD_OPTION_VALUES } from '../../../src/app/contactTraceCommonServices/internal-field-options';
import {
  goToBubbleView, goToCrosstabView, goToEpiCurveView, goToMapView,
  openBubbleSettingsDialog, openCrosstabSettingsDialog, openMapSettingsDialog,
} from '../../support/journey-helpers';
import { selectEpiCurveDropdown } from '../../support/epi-curve-helpers';

describe('Field-name collision edge cases', () => {
  const nodes = 'FieldNameEdgeCaseNodes.csv';
  const links = 'FieldNameEdgeCaseLinks.csv';
  const noneFieldValue = createFieldOptionValue('None', ['None']);

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('uses constructor as an ID, preserves CSV metadata and spaces, and protects collapsed-node state', () => {
    cy.loadFiles([
      { name: nodes, datatype: 'node', field1: 'constructor', field2: ' seq ' },
      { name: links, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
    ]);
    cy.contains('#file-table .file-table-row', nodes).find('select').first()
      .should('have.value', createFieldOptionValue('constructor'));
    cy.get('#launch').click();
    cy.window({ timeout: 30000 }).its('commonService.session.network.isFullyLoaded').should('be.true');
    cy.window({ timeout: 30000 }).should(win => {
      expect(win.commonService.visuals.twoD.isRendererReady(), 'active 2D renderer ready').to.be.true;
    });
    cy.window().then(win => {
      const { nodeFields, nodes: records, links: edges } = win.commonService.session.data;
      const node = records.find(record => record._id === 'NODE-A');
      expect(node).to.exist;
      expect(node['__proto__']).to.equal('proto-a');
      expect(Object.getPrototypeOf(node)).to.equal(win.Object.prototype);
      expect(node['isCollapsedAggregate (Imported)']).to.equal('true');
      expect(node.isCollapsedAggregate).to.be.undefined;
      expect(node['totalCount (Imported)']).to.equal('8');
      expect(node['counts (Imported)']).to.equal('not-an-array');
      expect(node['aggregateRenderedSize (Imported)']).to.equal('900');
      expect(node.Lat).to.equal('10');
      expect(node[' Lat ']).to.equal('20');
      expect(node.seq).to.equal('ACGT');
      expect(nodeFields).to.include.members(['Lat', ' Lat ', '__proto__']);
      expect(nodeFields).not.to.include.members(['constructor', ' seq ', 'Lat 2']);
      expect(edges[0]['__proto__']).to.equal('link-proto');
      const twoD = win.commonService.visuals.twoD;
      twoD.onNodeLabelVaribleChange('_id');
    });
    cy.window().should(win => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.isRendererReady(), 'active 2D renderer ready').to.be.true;
      if (twoD.sigmaActive) {
        const node = twoD.sigmaRenderer.getGraph().getNodeAttributes('NODE-A');
        expect(node.label).to.equal('NODE-A');
        expect(node.raw.raw.isCollapsedAggregate).not.to.be.ok;
      } else {
        const node = twoD.cy.getElementById('NODE-A');
        expect(node.data('label')).to.equal('NODE-A');
        expect(node.data('isCollapsedAggregate')).not.to.be.ok;
      }
    });
  });

  it('uses the real None field for global node/link styling and Map coordinates', () => {
    cy.loadFiles([
      { name: nodes, datatype: 'node', field1: 'constructor', field2: 'None' },
      { name: links, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
    ]);
    cy.get('#launch').click();
    cy.window({ timeout: 30000 }).its('commonService.session.network.isFullyLoaded').should('be.true');
    cy.openGlobalSettings();
    cy.get('#node-color-variable').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None$/).click();
    cy.get('.p-select-overlay:visible').should('not.exist');
    cy.window().should(win => {
      const { session, visuals } = win.commonService;
      expect(session.style.widgets['node-color-variable']).to.equal(noneFieldValue);
      expect(session.style.nodeColorsTableKeys[noneFieldValue]).to.include.members(['37', '38']);
      expect(new Set(visuals.microbeTrace.FieldList.map(option => option.value)).size)
        .to.equal(visuals.microbeTrace.FieldList.length);
    });
    cy.get('#link-tooltip-variable').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None$/).scrollIntoView().click();
    cy.get('.p-select-overlay:visible').should('not.exist');
    cy.window().should(win => {
      expect(win.commonService.session.style.widgets['link-color-variable']).to.equal(noneFieldValue);
      expect(win.commonService.session.style.linkColorsTableKeys[noneFieldValue]).to.include('Contact-A');
    });
    cy.get('#node-color-variable').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None \(No field\)$/).click();
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');
    cy.closeGlobalSettings();
    goToMapView();
    openMapSettingsDialog();
    cy.get('@mapSettings').find('#map-field-lat').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None$/).click();
    cy.get('@mapSettings').find('#map-field-lon').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^lon$/).click();
    cy.closeSettingsPane('Geospatial Settings');
    cy.window().should(win => {
      const node = win.commonService.session.data.nodes.find(record => record._id === 'NODE-A');
      expect(node._lat).to.equal(37);
      expect(node._lon).to.equal(-100);
      expect(node.None).to.equal('37');
      expect(INTERNAL_FIELD_OPTION_VALUES.none).not.to.equal(noneFieldValue);
    });
  });

  it('groups the real None field in Crosstab and Bubble without confusing the no-field choice', () => {
    cy.loadFiles([{ name: nodes, datatype: 'node', field1: 'constructor', field2: 'None' }]);
    cy.get('#launch').click();
    cy.window({ timeout: 30000 }).its('commonService.session.network.isFullyLoaded').should('be.true');
    goToCrosstabView();
    openCrosstabSettingsDialog();
    cy.get('#crosstab-x-variable').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None$/).click();
    cy.window().should(win => {
      const view = win.commonService.visuals.crossTab;
      expect(view.xVariable).to.equal(noneFieldValue);
      expect(view.formatTableTitle()).to.equal('None');
      expect(view.totalRow['37']).to.equal(1);
      expect(view.totalRow['38']).to.equal(1);
      expect(view.totalRow.Total).to.equal(2);
    });
    cy.closeSettingsPane('Crosstab Settings');
    goToBubbleView();
    openBubbleSettingsDialog();
    cy.get('#bubble-axis-x').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None$/).click();
    cy.window().its('commonService.visuals.bubble.X_categories').should('deep.equal', ['37', '38']);
    cy.get('#bubble-axis-x').click();
    cy.contains('[role="listbox"]:visible [role="option"]', /^None \(No field\)$/).click();
    cy.window().its('commonService.session.style.widgets.bubble-x').should('equal', 'None');
  });

  it('uses a real None date field and stack field in Epi Curve and can clear them', () => {
    cy.get('#fileDropRef').selectFile({
      contents: Cypress.Buffer.from(JSON.stringify([
        { case_id: 'A', None: '2025-01-01' }, { case_id: 'B', None: '2025-01-02' },
      ])),
      fileName: 'NoneFieldNodes.json', mimeType: 'application/json',
    }, { force: true });
    cy.contains('#file-table .file-table-row', 'NoneFieldNodes.json').should('be.visible');
    cy.get('#launch').click();
    cy.window({ timeout: 30000 }).its('commonService.session.network.isFullyLoaded').should('be.true');
    goToEpiCurveView();
    selectEpiCurveDropdown('Date Field', 'None', noneFieldValue);
    selectEpiCurveDropdown('Color By', 'None', noneFieldValue);
    cy.get('#epiCurveSVG .epiCurve-epi-curve rect').should('have.length', 2);
    cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 2);
    selectEpiCurveDropdown('Color By', 'None (No field)', INTERNAL_FIELD_OPTION_VALUES.none);
    selectEpiCurveDropdown('Date Field', 'None (No field)', INTERNAL_FIELD_OPTION_VALUES.none);
    cy.get('#epiCurveSVG .epiCurve-epi-curve rect').should('have.length', 0);
    cy.window().then(win => {
      const view = win.commonService.visuals.epiCurve;
      expect(view.getCurrentStackKeys(view.getCurrentStackColorVariable())).to.deep.equal([]);
    });
  });
});
