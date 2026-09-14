/// <reference types="cypress" />

import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const featureProfile: any = {
  id: 'renderer-session-roundtrip',
  title: 'Renderer session roundtrip',
  tags: ['renderer-comparison'],
  files: [
    {
      name: 'renderer-comparison/feature-parity-nodes.csv',
      datatype: 'node',
      field1: '_id',
    },
    {
      name: 'renderer-comparison/feature-parity-links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
      field3: 'distance',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: 'Table',
  },
  expectations: {},
};

const featureWidgets = {
  'node-color-variable': 'Exposure',
  'node-qc-status-variable': 'QC Status',
  'node-qc-severity-variable': 'QC Severity',
  'node-qc-reason-variable': 'QC Reason',
  'node-uncertainty-variable': 'Uncertainty',
  'polygons-foci': 'Case ID',
  'polygons-show': true,
  'polygons-color-show': true,
  'polygons-label-show': true,
  'map-field-lat': 'Latitude',
  'map-field-lon': 'Longitude',
  'network-geographic-overlay': true,
  'network-edge-detail-mode': 'all',
};

const savedViewState = {
  centerX: 120,
  centerY: -80,
  graphUnitsPerPixel: 2,
  edgeDetailMode: 'all',
};

function expectViewStateClose(actual: any): void {
  expect(actual?.centerX).to.be.closeTo(savedViewState.centerX, 5);
  expect(actual?.centerY).to.be.closeTo(savedViewState.centerY, 5);
  expect(actual?.graphUnitsPerPixel).to.be.closeTo(savedViewState.graphUnitsPerPixel, 0.2);
  expect(actual?.edgeDetailMode).to.equal(savedViewState.edgeDetailMode);
}

function launchSourceSession(): void {
  visitAppAndAcceptEula({
    extraQuery: { renderer: 'cytoscape-webgl', rendererProfile: 'optimized' },
  });
  cy.loadFiles(featureProfile.files);
  applyPreLaunchFileSettings(featureProfile);
  ensurePreLaunchProfileSynced(featureProfile);
  launchAndWaitForProcessing(120000);
  cy.window().then((win: any) => Object.assign(
    win.commonService.session.style.widgets,
    featureWidgets,
  ));
  ensureTwoDNetworkView();
}

function assertRestoredSession(
  renderer: 'cytoscape-webgl' | 'sigma',
  sessionFilePath: string,
): void {
  visitAppAndAcceptEula({
    extraQuery: { renderer, rendererProfile: 'optimized' },
  });
  cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
  cy.window({ timeout: 120000 }).should((win: any) => {
    expect(win.commonService.session.network.isFullyLoaded).to.equal(true);
    expect(win.commonService.session.data.nodes).to.have.length(12);
  });
  ensureTwoDNetworkView();

  cy.window({ timeout: 30000 }).should((win: any) => {
    const diagnostics = win.mtRendererComparison?.getDiagnostics();
    expect(diagnostics?.requestedMode).to.equal(renderer);
    expect(diagnostics?.activeMode).to.equal(renderer);
    expect(diagnostics?.webglActive).to.equal(true);
    expect(diagnostics?.residentNodeCount).to.equal(9);
    expect(diagnostics?.residentEdgeCount).to.equal(11);
    expect(diagnostics?.mixedValueDonutNodeCount).to.equal(5);
    expect(diagnostics?.qcOverlayNodeCount).to.equal(9);
    expect(diagnostics?.uncertaintyOverlayNodeCount).to.equal(9);
    expect(diagnostics?.geographicOverlayActive).to.equal(true);
    expect(diagnostics?.geographicPositionedNodeCount).to.equal(9);
    expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal(['mt-group:CASE-A']);
    expect(win.commonService.session.meta.rendererGrouping).to.deep.equal({
      groupField: 'Case ID',
      collapsedGroupIds: ['mt-group:CASE-A'],
    });
    expectViewStateClose(win.mtRendererComparison.getViewState());
    expectViewStateClose(win.commonService.session.meta.rendererViewState);
    if (renderer === 'sigma') {
      expect(diagnostics?.drawnEdgeCount).to.equal(11);
    }
    expect(win.commonService.session.data.nodes
      .filter((node: any) => node.selected)
      .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
  });

  cy.window().then((win: any) => win.mtRendererComparison.setCollapsedGroups([]));
  cy.window({ timeout: 30000 }).should((win: any) => {
    const diagnostics = win.mtRendererComparison.getDiagnostics();
    expect(diagnostics.residentNodeCount).to.equal(12);
    expect(diagnostics.residentEdgeCount).to.equal(15);
    expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal([]);
    if (renderer === 'sigma') {
      expect(win.sigmaPocInstance.getSelectedNodeIds()).to.deep.equal(['SEQ-001']);
    } else {
      expect(win.cytoscapeInstance.nodes(':selected').map((node: any) => node.id()))
        .to.deep.equal(['SEQ-001']);
    }
  });
}

describe('Renderer-neutral session restoration', () => {
  it('restores one saved collapsed session into either optimized renderer', () => {
    const sessionFileBase = `cypress_renderer_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchSourceSession();
    cy.window().then((win: any) => {
      win.cytoscapeInstance.getElementById('SEQ-001').select();
    });
    cy.window().should((win: any) => {
      expect(win.commonService.session.data.nodes
        .filter((node: any) => node.selected)
        .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
    });
    cy.window().then((win: any) => win.mtRendererComparison.setCollapsedGroups(['CASE-A']));
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal(['mt-group:CASE-A']);
      expect(win.mtRendererComparison.getDiagnostics().residentNodeCount).to.equal(9);
      expect(win.commonService.session.network.rendering).to.equal(false);
    });
    cy.window().then((win: any) => win.mtRendererComparison.setViewState(savedViewState));
    cy.window().should((win: any) => {
      expectViewStateClose(win.mtRendererComparison.getViewState());
      expectViewStateClose(win.commonService.session.meta.rendererViewState);
    });

    saveSessionFromFileMenu(sessionFileBase);
    cy.window().then((win: any) => {
      expectViewStateClose(win.commonService.session.meta.rendererViewState);
    });
    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      const stash = JSON.parse(String(savedSession));
      expect(stash.session.meta.rendererGrouping).to.deep.equal({
        groupField: 'Case ID',
        collapsedGroupIds: ['mt-group:CASE-A'],
      });
      expectViewStateClose(stash.session.meta.rendererViewState);
      expect(stash.session.data.nodes
        .filter((node: any) => node.selected)
        .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
    });

    assertRestoredSession('cytoscape-webgl', sessionFilePath);
    assertRestoredSession('sigma', sessionFilePath);
  });
});
