/// <reference types="cypress" />

import {
  installSaveAsCaptureHook,
  saveSessionFromFileMenu,
  writeCapturedDownloadToDisk,
} from '../../support/journey-helpers';

type RendererViewState = {
  centerX: number;
  centerY: number;
  graphUnitsPerPixel: number;
  edgeDetailMode: 'overview' | 'detail' | 'all';
};

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 30000 })
    .should('contain.text', '33 nodes')
    .and('contain.text', '74 links resident');
};

const expectCloseTo = (actual: number, expected: number, label: string): void => {
  const tolerance = Math.max(0.01, Math.abs(expected) * 0.01);
  expect(actual, label).to.be.closeTo(expected, tolerance);
};

describe('Sigma session round-trip', () => {
  it('restores renderer state, styles, selection, and graph counts from a saved session', () => {
    const sessionFileBase = `cypress_sigma_session_${Date.now()}`;
    const sessionFileName = `${sessionFileBase}.microbetrace`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileName}`;
    let expectedState: RendererViewState;
    let selectedNodeId = '';

    cy.visit('/?skipEula=1');
    loadSampleDataset();
    installSaveAsCaptureHook();

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const currentState = twoD.getRendererViewState() as RendererViewState;

      expectedState = {
        centerX: currentState.centerX + 4.5,
        centerY: currentState.centerY - 3.25,
        graphUnitsPerPixel: currentState.graphUnitsPerPixel * 1.15,
        edgeDetailMode: 'all',
      };
      twoD.onNodeBorderWidthChange(4);
      twoD.onNodeLabelOrientationChange('Top');
      twoD.setRendererViewState(expectedState);

      selectedNodeId = [...twoD.sigmaRenderer.getNodeIds()].sort()[0];
      twoD.sigmaRenderer.selectNodes([selectedNodeId]);

      expect(appWindow.commonService.session.meta.rendererViewState)
        .to.deep.equal(expectedState);
      expect(twoD.widgets['network-edge-detail-mode']).to.equal('all');
      expect(twoD.widgets['node-border-width']).to.equal(4);
      expect(twoD.widgets['node-label-orientation']).to.equal('Top');
      expect(twoD.sigmaRenderer.getSelectedNodeIds()).to.deep.equal([selectedNodeId]);
      expect(appWindow.commonService.session.data.nodes
        .find((node: any) => String(node._id ?? node.id) === selectedNodeId)?.selected)
        .to.equal(true);
    });

    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(sessionFileName, sessionFilePath);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).then(savedSessionText => {
      const saved = JSON.parse(String(savedSessionText));
      const rendererState = saved.session.meta.rendererViewState as RendererViewState;
      const selectedNode = saved.session.data.nodes
        .find((node: any) => String(node._id ?? node.id) === selectedNodeId);

      expect(rendererState.edgeDetailMode).to.equal('all');
      expectCloseTo(rendererState.centerX, expectedState.centerX, 'saved camera center x');
      expectCloseTo(rendererState.centerY, expectedState.centerY, 'saved camera center y');
      expectCloseTo(
        rendererState.graphUnitsPerPixel,
        expectedState.graphUnitsPerPixel,
        'saved camera scale',
      );
      expect(saved.session.style.widgets['node-border-width']).to.equal(4);
      expect(saved.session.style.widgets['node-label-orientation']).to.equal('Top');
      expect(selectedNode?.selected, 'saved selected node').to.equal(true);
    });

    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);
    cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 60000 })
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links resident')
      .and('contain.text', '74 links drawn');
    cy.get('#cy').should('not.exist');

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const restoredState = twoD.getRendererViewState() as RendererViewState;
      const savedState = appWindow.commonService.session.meta.rendererViewState as RendererViewState;
      const graph = twoD.sigmaRenderer.getGraph();
      const firstNodeId = graph.nodes()[0];

      expectCloseTo(savedState.centerX, expectedState.centerX, 'loaded saved camera center x');
      expectCloseTo(savedState.centerY, expectedState.centerY, 'loaded saved camera center y');
      expectCloseTo(
        savedState.graphUnitsPerPixel,
        expectedState.graphUnitsPerPixel,
        'loaded saved camera scale',
      );

      expect(twoD.requestedRendererMode).to.equal('sigma');
      expect(twoD.sigmaSummary.edgeDetailMode).to.equal('all');
      expect(twoD.widgets['network-edge-detail-mode']).to.equal('all');
      expect(twoD.widgets['node-border-width']).to.equal(4);
      expect(twoD.widgets['node-label-orientation']).to.equal('Top');
      expect(graph.getNodeAttribute(firstNodeId, 'borderWidth')).to.equal(4);
      expect(graph.getNodeAttribute(firstNodeId, 'labelPosition')).to.equal('above');
      expect(twoD.sigmaRenderer.getSelectedNodeIds()).to.deep.equal([selectedNodeId]);
      expect(appWindow.commonService.session.data.nodes
        .find((node: any) => String(node._id ?? node.id) === selectedNodeId)?.selected)
        .to.equal(true);
      expectCloseTo(restoredState.centerX, expectedState.centerX, 'restored camera center x');
      expectCloseTo(restoredState.centerY, expectedState.centerY, 'restored camera center y');
      expectCloseTo(
        restoredState.graphUnitsPerPixel,
        expectedState.graphUnitsPerPixel,
        'restored camera scale',
      );

      const rendererResources = win.performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /cytoscape(?:\.esm|-svg)/i.test(name));
      expect(rendererResources, 'Cytoscape resources after Sigma session restore').to.deep.equal([]);
    });
  });
});
