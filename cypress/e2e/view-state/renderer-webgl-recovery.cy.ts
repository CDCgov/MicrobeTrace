/// <reference types="cypress" />

import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

type WebglComparisonWindow = Window & {
  cytoscapeInstance?: any;
  sigmaPocInstance?: any;
  mtRendererComparison?: {
    getDiagnostics: () => {
      activeMode: string;
      webglActive: boolean;
      fallbackReason: string | null;
      residentNodeCount: number;
      residentEdgeCount: number;
    };
  };
};

const averageGraphProfile = {
  id: 'renderer-recovery-average-graph',
  title: 'Renderer recovery average graph',
  tags: ['renderer', 'webgl-recovery'],
  files: [
    {
      name: 'performance/average-graph-nodes.csv',
      datatype: 'node' as const,
      field1: '_id',
    },
    {
      name: 'performance/average-graph-links.csv',
      datatype: 'link' as const,
      field1: 'source',
      field2: 'target',
      field3: 'distance',
    },
  ],
  preLaunch: {
    metric: 'snps' as const,
    threshold: 16,
    defaultView: '2D Network' as const,
  },
  expectations: {},
};

function launchAverageGraph(renderer: 'cytoscape-webgl' | 'sigma'): void {
  visitAppAndAcceptEula({ extraQuery: { renderer } });
  cy.loadFiles(averageGraphProfile.files);
  applyPreLaunchFileSettings(averageGraphProfile);
  ensurePreLaunchProfileSynced(averageGraphProfile);
  launchAndWaitForProcessing(120000);
  ensureTwoDNetworkView();
}

function loseWebglContext(containerSelector: string): void {
  cy.get(`${containerSelector} canvas`, { timeout: 30000 }).should('exist');
  cy.window().then((win: unknown) => {
    const typedWindow = win as WebglComparisonWindow;
    const canvases = Array.from(
      typedWindow.document.querySelectorAll(`${containerSelector} canvas`),
    ) as HTMLCanvasElement[];
    const webgl = canvases
      .map(canvas => canvas.getContext('webgl2') || canvas.getContext('webgl'))
      .find(Boolean) as WebGLRenderingContext | WebGL2RenderingContext | undefined;
    expect(webgl, `${containerSelector} WebGL context`).to.exist;
    const extension = webgl?.getExtension('WEBGL_lose_context');
    expect(extension, 'WEBGL_lose_context extension').to.exist;
    extension?.loseContext();
  });
}

describe('2D renderer WebGL failure recovery', { retries: 0 }, () => {
  it('falls Cytoscape WebGL back to Canvas without losing the represented graph', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&largeDemo=1&renderer=cytoscape-webgl');
    cy.contains('button', 'Continue with Large Network Demo', { timeout: 30000 }).click({ force: true });
    cy.get('[data-testid="cytoscape-webgl-banner"]', { timeout: 120000 })
      .should('contain.text', 'WebGL active');
    cy.window({ timeout: 120000 }).should((win: unknown) => {
      const typedWindow = win as WebglComparisonWindow;
      expect(
        Number(typedWindow.mtRendererComparison?.getDiagnostics().residentNodeCount || 0),
        'Cytoscape resident nodes before context loss',
      ).to.be.greaterThan(0);
      expect(Boolean(typedWindow.cytoscapeInstance), 'Cytoscape instance before context loss')
        .to.equal(true);
    });

    loseWebglContext('#cy');

    cy.window({ timeout: 120000 }).should((win: unknown) => {
      const typedWindow = win as WebglComparisonWindow;
      const diagnostics = typedWindow.mtRendererComparison?.getDiagnostics();
      expect(diagnostics?.activeMode, 'fallback renderer').to.equal('cytoscape-canvas');
      expect(diagnostics?.webglActive, 'WebGL active after fallback').to.equal(false);
      expect(diagnostics?.fallbackReason, 'fallback reason').to.contain('context was lost');
      expect(diagnostics?.residentNodeCount, 'resident nodes after fallback').to.be.greaterThan(0);
      expect(diagnostics?.residentEdgeCount, 'resident edges after fallback').to.be.greaterThan(0);
    });
    cy.get('[data-testid="cytoscape-webgl-fallback"]')
      .should('have.attr', 'role', 'status')
      .and('have.attr', 'aria-live', 'polite')
      .and('contain.text', 'recovered with Canvas');
  });

  it('recreates Sigma WebGL without losing its resident graph or selection state', () => {
    launchAverageGraph('sigma');
    cy.get('[data-testid="sigma-poc-summary"]', { timeout: 120000 }).should('be.visible');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WebglComparisonWindow;
      const adapter = typedWindow.sigmaPocInstance;
      const nodeId = adapter.getGraph().nodes()[0];
      adapter.selectNodes([nodeId]);
      cy.wrap(nodeId).as('selectedNodeId');
      cy.wrap(adapter.getSummary()).as('summaryBeforeLoss');
    });

    loseWebglContext('#sigma-network-poc');

    cy.get('[data-testid="sigma-webgl-recovery"]', { timeout: 120000 })
      .should('contain.text', 'recreated its WebGL context');
    cy.window().should((win: unknown) => {
      const typedWindow = win as WebglComparisonWindow;
      const diagnostics = typedWindow.mtRendererComparison?.getDiagnostics();
      expect(diagnostics?.activeMode, 'Sigma renderer after recovery').to.equal('sigma');
      expect(diagnostics?.webglActive, 'Sigma WebGL after recovery').to.equal(true);
    });
    cy.get('@summaryBeforeLoss').then((summaryBeforeLoss: any) => {
      cy.get('@selectedNodeId').then((selectedNodeId) => {
        cy.window().then((win: unknown) => {
          const adapter = (win as WebglComparisonWindow).sigmaPocInstance;
          expect(adapter.getSummary(), 'Sigma graph summary after recovery').to.deep.equal(summaryBeforeLoss);
          expect(adapter.getSelectedNodeIds(), 'Sigma selection after recovery')
            .to.deep.equal([String(selectedNodeId)]);
        });
      });
    });

    cy.window().then((win: unknown) => {
      cy.wrap((win as WebglComparisonWindow).sigmaPocInstance.getRenderer(), { log: false })
        .as('rendererAfterFirstRecovery');
    });
    loseWebglContext('#sigma-network-poc');
    cy.get('[data-testid="sigma-webgl-recovery"]', { timeout: 120000 })
      .should('have.attr', 'role', 'status')
      .and('have.attr', 'aria-live', 'polite')
      .and('contain.text', 'recreated its WebGL context');
    cy.get('@rendererAfterFirstRecovery').then((rendererAfterFirstRecovery) => {
      cy.window({ timeout: 120000 }).should((win: unknown) => {
        const typedWindow = win as WebglComparisonWindow;
        expect(typedWindow.sigmaPocInstance.getRenderer(), 'new renderer after second loss')
          .not.to.equal(rendererAfterFirstRecovery);
        expect(typedWindow.mtRendererComparison?.getDiagnostics().webglActive)
          .to.equal(true);
      });
    });
    cy.get('@summaryBeforeLoss').then((summaryBeforeLoss: any) => {
      cy.get('@selectedNodeId').then((selectedNodeId) => {
        cy.window().then((win: unknown) => {
          const adapter = (win as WebglComparisonWindow).sigmaPocInstance;
          expect(adapter.getSummary(), 'Sigma graph summary after repeated recovery')
            .to.deep.equal(summaryBeforeLoss);
          expect(adapter.getSelectedNodeIds(), 'Sigma selection after repeated recovery')
            .to.deep.equal([String(selectedNodeId)]);
        });
      });
    });
  });
});
