/// <reference types="cypress" />

import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTableView,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

const featureProfile: any = {
  id: 'renderer-feature-parity',
  title: 'Renderer feature parity',
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
    // Configure renderer-neutral feature fields after ingestion, then open 2D
    // so both adapters see exactly the same finalized session settings.
    defaultView: 'Table',
  },
  expectations: {},
};

function launchFeatureFixture(renderer: 'cytoscape-webgl' | 'sigma'): void {
  visitAppAndAcceptEula({
    extraQuery: { renderer, rendererProfile: 'optimized' },
  });
  cy.loadFiles(featureProfile.files);
  applyPreLaunchFileSettings(featureProfile);
  ensurePreLaunchProfileSynced(featureProfile);
  launchAndWaitForProcessing(120000);
  cy.window().then((win: any) => {
    Object.assign(win.commonService.session.style.widgets, {
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
    });
  });
  ensureTwoDNetworkView();
}

function expectFeatureCanvas(renderer: 'cytoscape-webgl' | 'sigma'): void {
  cy.get(`[data-testid="network-node-feature-overlay"][data-renderer="${renderer}"]`, {
    timeout: 30000,
  }).should(($canvas) => {
    const canvas = $canvas[0] as HTMLCanvasElement;
    expect(canvas.width, 'feature canvas width').to.be.greaterThan(0);
    expect(canvas.height, 'feature canvas height').to.be.greaterThan(0);
    if (renderer === 'sigma') {
      expect(canvas.dataset.renderMode, 'Sigma feature rendering mode').to.equal('webgl-program');
      return;
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    expect(context, 'feature canvas context').to.exist;
    const pixels = context!.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) nonTransparentPixels += 1;
    }
    expect(nonTransparentPixels, 'drawn feature pixels').to.be.greaterThan(100);
  });
}

function expectSigmaHullCanvas(): void {
  cy.get('[data-testid="network-group-hull-overlay"][data-renderer="sigma"]', {
    timeout: 30000,
  }).should(($canvas) => {
    const canvas = $canvas[0] as HTMLCanvasElement;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    expect(context, 'group hull canvas context').to.exist;
    const pixels = context!.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) nonTransparentPixels += 1;
    }
    expect(nonTransparentPixels, 'drawn hull pixels').to.be.greaterThan(100);
  });
}

function expectGeographicCanvas(renderer: 'cytoscape-webgl' | 'sigma'): void {
  cy.get(`[data-testid="network-geographic-overlay"][data-renderer="${renderer}"]`, {
    timeout: 30000,
  }).should(($canvas) => {
    const canvas = $canvas[0] as HTMLCanvasElement;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    expect(context, 'geographic overlay canvas context').to.exist;
    const pixels = context!.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) nonTransparentPixels += 1;
    }
    expect(nonTransparentPixels, 'drawn geographic pixels').to.be.greaterThan(100);
  });
}

function expectCompositeExport(
  renderer: 'cytoscape-webgl' | 'sigma',
  expectedNodes: number,
  expectedLinks: number,
  expectedCollapsedGroups: number,
): void {
  cy.window().then((win: any) => {
    const exported = win.mtRendererComparison.exportComposite();
    expect(exported.width).to.be.greaterThan(100);
    expect(exported.height).to.be.greaterThan(100);
    expect(exported.canvasLayerCount).to.be.greaterThan(3);
    expect(exported.pngDataUrl).to.match(/^data:image\/png;base64,/);
    expect(exported.pngDataUrl.length).to.be.greaterThan(5000);

    const svg = new DOMParser().parseFromString(exported.svg, 'image/svg+xml');
    expect(svg.querySelector('parsererror')).not.to.exist;
    expect(Number(svg.documentElement.getAttribute('width'))).to.equal(exported.width);
    expect(Number(svg.documentElement.getAttribute('height'))).to.equal(exported.height);
    const image = svg.querySelector('image');
    expect(image?.getAttribute('href')).to.equal(exported.pngDataUrl);
    const metadata = JSON.parse(
      svg.querySelector('#microbetrace-renderer-export-metadata')?.textContent || '{}',
    );
    expect(metadata.renderer).to.equal(renderer);
    expect(metadata.residentNodeCount).to.equal(expectedNodes);
    expect(metadata.residentEdgeCount).to.equal(expectedLinks);
    expect(metadata.collapsedGroupIds).to.have.length(expectedCollapsedGroups);
    expect(metadata.geographicOverlayActive).to.equal(true);
    expect(metadata.mixedValueDonutNodeCount).to.be.greaterThan(0);
    expect(metadata.qcOverlayNodeCount).to.equal(expectedNodes);
    expect(metadata.uncertaintyOverlayNodeCount).to.equal(expectedNodes);
  });
}

describe('renderer-neutral architectural feature fixture', () => {
  (['cytoscape-webgl', 'sigma'] as const).forEach(renderer => {
    it(`renders equivalent mixed-value, QC, uncertainty, grouping, and selection semantics in ${renderer}`, () => {
      launchFeatureFixture(renderer);

      cy.window({ timeout: 30000 }).should((win: any) => {
        const diagnostics = win.mtRendererComparison?.getDiagnostics();
        expect(diagnostics?.requestedMode).to.equal(renderer);
        expect(diagnostics?.activeMode).to.equal(renderer);
        expect(diagnostics?.webglActive).to.equal(true);
        expect(diagnostics?.mixedValueDonutNodeCount).to.equal(6);
        expect(diagnostics?.qcOverlayNodeCount).to.equal(12);
        expect(diagnostics?.uncertaintyOverlayNodeCount).to.equal(12);
        expect(diagnostics?.groupCount).to.equal(3);
        expect(diagnostics?.renderedGroupHullCount).to.equal(3);
        expect(diagnostics?.geographicOverlayActive).to.equal(true);
        expect(diagnostics?.geographicPositionedNodeCount).to.equal(12);
        if (renderer === 'sigma') {
          expect(win.sigmaPocInstance.usesCustomWebglNodeFeatures()).to.equal(true);
        }
      });
      expectFeatureCanvas(renderer);
      expectGeographicCanvas(renderer);
      expectCompositeExport(renderer, 12, 15, 0);
      cy.get('[data-testid="renderer-accessible-feature-summary"]')
        .should('contain.text', '6 mixed-value donut nodes')
        .and('contain.text', '12 QC overlays')
        .and('contain.text', '12 uncertainty overlays');
      cy.get('[data-testid="renderer-accessible-feature-summary"] [data-node-id="SEQ-001"]')
        .should('contain.text', 'Exposure: Food 67%, Travel 33%')
        .and('contain.text', 'QC Review: Mixed specimen signal')
        .and('contain.text', 'uncertainty 70%');

      const keyboardTarget = renderer === 'sigma'
        ? '[data-testid="sigma-network-poc"]'
        : '[data-testid="cytoscape-network"]';
      cy.get(keyboardTarget)
        .should('have.attr', 'tabindex', '0')
        .and('have.attr', 'role', 'application')
        .focus()
        .type('{rightarrow}{leftarrow}{enter}');
      cy.window().should((win: any) => {
        expect(win.mtRendererComparison.getKeyboardState().focusedNodeId).to.equal('SEQ-001');
        expect(win.commonService.session.data.nodes
          .filter((node: any) => node.selected)
          .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
        if (renderer === 'sigma') {
          expect(win.sigmaPocInstance.getKeyboardFocusedNodeId()).to.equal('SEQ-001');
        } else {
          expect(win.cytoscapeInstance.getElementById('SEQ-001')
            .hasClass('renderer-keyboard-focus')).to.equal(true);
          expect(win.cytoscapeInstance.getElementById('SEQ-001')
            .connectedEdges('.renderer-keyboard-neighbor').length).to.be.greaterThan(0);
        }
      });
      cy.get('[data-testid="network-renderer-live-status"]')
        .should('contain.text', 'SEQ-001 selected');
      cy.get(keyboardTarget).type('{esc}');
      cy.window().should((win: any) => {
        expect(win.commonService.session.data.nodes.some((node: any) => node.selected)).to.equal(false);
      });
      cy.get('[data-testid="network-renderer-live-status"]')
        .should('contain.text', 'Network selection cleared');
      cy.get(keyboardTarget).type('{enter}');

      cy.window().then((win: any) => {
        const position = (nodeId: string) => renderer === 'sigma'
          ? {
              x: win.sigmaPocInstance.getGraph().getNodeAttribute(nodeId, 'x'),
              y: win.sigmaPocInstance.getGraph().getNodeAttribute(nodeId, 'y'),
            }
          : win.cytoscapeInstance.getElementById(nodeId).position();
        const atlanta = position('SEQ-001');
        const newYork = position('SEQ-005');
        const seattle = position('SEQ-009');
        expect(seattle.x).to.be.lessThan(atlanta.x);
        expect(atlanta.x).to.be.lessThan(newYork.x);
        expect(seattle.y).to.be.lessThan(newYork.y);
        expect(newYork.y).to.be.lessThan(atlanta.y);

        if (renderer === 'sigma') {
          const adapter = win.sigmaPocInstance;
          const features = adapter.getGraph().getNodeAttribute('SEQ-001', 'features');
          expect(features.donutSegments).to.have.length(2);
          expect(features.qc.severity).to.equal('warning');
          expect(features.accessibleLabel).to.contain('Exposure: Food 67%, Travel 33%');
          const groups = adapter.getGraph().nodes().reduce((counts: Record<string, number>, nodeId: string) => {
            const group = adapter.getGraph().getNodeAttribute(nodeId, 'group');
            counts[group] = (counts[group] || 0) + 1;
            return counts;
          }, {});
          expect(groups).to.deep.equal({ 'CASE-A': 4, 'CASE-B': 4, 'CASE-C': 4 });
          adapter.selectNodes(['SEQ-001']);
          expect(adapter.getSelectedNodeIds()).to.deep.equal(['SEQ-001']);
        } else {
          const cyInstance = win.cytoscapeInstance;
          const node = cyInstance.getElementById('SEQ-001');
          const features = node.data('nodeFeature');
          expect(features.donutSegments).to.have.length(2);
          expect(features.qc.severity).to.equal('warning');
          expect(features.accessibleLabel).to.contain('Exposure: Food 67%, Travel 33%');
          expect(cyInstance.nodes(':parent').map((parent: any) => parent.children().length).sort())
            .to.deep.equal([4, 4, 4]);
          node.select();
          expect(cyInstance.nodes(':selected').map((selected: any) => selected.id()))
            .to.deep.equal(['SEQ-001']);
        }
      });
      if (renderer === 'sigma') expectSigmaHullCanvas();

      cy.window().should((win: any) => {
        const selected = win.commonService.session.data.nodes
          .filter((node: any) => node.selected)
          .map((node: any) => node._id);
        expect(selected).to.deep.equal(['SEQ-001']);
      });
      cy.get('[data-testid="renderer-accessible-feature-summary"] [data-node-id="SEQ-001"]')
        .should('contain.text', 'selected');

      cy.window().then((win: any) => {
        if (renderer === 'sigma') {
          const caseANodeIds = win.sigmaPocInstance.getGraph().nodes()
            .filter((nodeId: string) => (
              win.sigmaPocInstance.getGraph().getNodeAttribute(nodeId, 'group') === 'CASE-A'
            ));
          win.sigmaPocInstance.selectNodes(caseANodeIds);
        } else {
          win.cytoscapeInstance.elements().unselect();
          win.cytoscapeInstance.nodes(':parent')
            .filter((parent: any) => parent.data('label') === 'CASE-A')
            .select();
        }
      });
      cy.window().should((win: any) => {
        const selectedCaseMembers = win.commonService.session.data.nodes
          .filter((node: any) => node.selected)
          .map((node: any) => node._id)
          .sort();
        expect(selectedCaseMembers).to.deep.equal(['SEQ-001', 'SEQ-002', 'SEQ-003', 'SEQ-004']);
      });
      cy.window().then((win: any) => {
        if (renderer === 'sigma') {
          win.sigmaPocInstance.selectNodes(['SEQ-001']);
        } else {
          win.cytoscapeInstance.elements().unselect();
          win.cytoscapeInstance.getElementById('SEQ-001').select();
        }
      });
      cy.window().should((win: any) => {
        expect(win.commonService.session.data.nodes
          .filter((node: any) => node.selected)
          .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
      });

      cy.get(keyboardTarget).focus().type('g');
      cy.window({ timeout: 30000 }).should((win: any) => {
        expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal(['mt-group:CASE-A']);
        expect(win.mtRendererComparison.getKeyboardState().focusedNodeId).to.equal('mt-group:CASE-A');
        expect(win.mtRendererComparison.getKeyboardState().liveStatus).to.contain('CASE-A collapsed');
      });
      cy.get(keyboardTarget).focus().type('g');
      cy.window({ timeout: 30000 }).should((win: any) => {
        expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal([]);
        expect(win.mtRendererComparison.getKeyboardState().focusedNodeId).to.equal('SEQ-001');
        expect(win.mtRendererComparison.getKeyboardState().liveStatus).to.contain('CASE-A expanded');
      });

      cy.window().then((win: any) =>
        win.mtRendererComparison.setCollapsedGroups(['CASE-A', 'CASE-B', 'CASE-C']));
      cy.window({ timeout: 30000 }).should((win: any) => {
        const diagnostics = win.mtRendererComparison.getDiagnostics();
        expect(win.mtRendererComparison.getCollapsedGroupIds()).to.have.length(3);
        expect(diagnostics.groupCount).to.equal(3);
        expect(diagnostics.residentNodeCount).to.equal(3);
        expect(diagnostics.residentEdgeCount).to.equal(3);
        expect(diagnostics.mixedValueDonutNodeCount).to.equal(3);
        expect(diagnostics.qcOverlayNodeCount).to.equal(3);
        expect(diagnostics.uncertaintyOverlayNodeCount).to.equal(3);
        expect(diagnostics.renderedGroupHullCount).to.equal(0);
        expect(diagnostics.geographicOverlayActive).to.equal(true);
        expect(diagnostics.geographicPositionedNodeCount).to.equal(3);
        expect(win.commonService.session.data.nodes).to.have.length(12);
        expect(win.commonService.session.data.links).to.have.length(15);
        if (renderer === 'sigma') {
          expect(win.sigmaPocInstance.getGraph().nodes()
            .every((nodeId: string) => Boolean(
              win.sigmaPocInstance.getGraph().getNodeAttribute(nodeId, 'raw').raw.rendererGroupAggregate,
            ))).to.equal(true);
        } else {
          expect(win.cytoscapeInstance.nodes('.renderer-group-aggregate')).to.have.length(3);
          expect(win.cytoscapeInstance.nodes(':parent')).to.have.length(0);
        }
      });
      cy.get('[data-testid="renderer-accessible-feature-summary"]')
        .should('contain.text', '3 network nodes')
        .and('contain.text', '3 mixed-value donut nodes');
      expectCompositeExport(renderer, 3, 3, 3);

      cy.window().then((win: any) => win.mtRendererComparison.setCollapsedGroups([]));
      cy.window({ timeout: 30000 }).should((win: any) => {
        expect(win.mtRendererComparison.getCollapsedGroupIds()).to.deep.equal([]);
        expect(win.mtRendererComparison.getDiagnostics().groupCount).to.equal(3);
        expect(win.mtRendererComparison.getDiagnostics().geographicPositionedNodeCount).to.equal(12);
        if (renderer === 'sigma') {
          expect(win.sigmaPocInstance.getGraph().order).to.equal(12);
          expect(win.sigmaPocInstance.getGraph().size).to.equal(15);
          expect(win.sigmaPocInstance.getSelectedNodeIds()).to.deep.equal(['SEQ-001']);
        } else {
          expect(win.cytoscapeInstance.nodes().filter((node: any) => !node.isParent())).to.have.length(12);
          expect(win.cytoscapeInstance.edges()).to.have.length(15);
          expect(win.cytoscapeInstance.nodes(':selected').map((node: any) => node.id()))
            .to.deep.equal(['SEQ-001']);
        }
      });

      ensureTableView();
      cy.window()
        .its('commonService.visuals.tableComp.SelectedTableData.dataSelection')
        .should('have.length', 1);
      ensureTwoDNetworkView();
      cy.window({ timeout: 30000 }).should((win: any) => {
        expect(win.commonService.session.data.nodes
          .filter((node: any) => node.selected)
          .map((node: any) => node._id)).to.deep.equal(['SEQ-001']);
        if (renderer === 'sigma') {
          expect(win.sigmaPocInstance.getSelectedNodeIds()).to.deep.equal(['SEQ-001']);
        } else {
          expect(win.cytoscapeInstance.nodes(':selected')
            .filter((node: any) => !node.isParent())
            .map((node: any) => node.id())).to.deep.equal(['SEQ-001']);
        }
      });
    });
  });
});
