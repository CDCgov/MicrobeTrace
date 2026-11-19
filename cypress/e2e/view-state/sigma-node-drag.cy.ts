/// <reference types="cypress" />

function dragNode(nodeId: string, pinned = false): void {
  let before: { x: number; y: number };
  let camera: any;
  let mouseLayer: HTMLElement;
  let start: { clientX: number; clientY: number };
  let dispatch: (type: string, x: number, y: number, buttons: number) => void;

  cy.window().then((win: any) => {
    const twoD = win.commonService.visuals.twoD;
    const adapter = twoD.sigmaRenderer, renderer = adapter.getRenderer();
    renderer.getCamera().setState({ x: 0.5, y: 0.5, angle: 0, ratio: 1.6 });
    renderer.refresh();
    const node = adapter.getGraph().getNodeAttributes(nodeId);
    const point = renderer.graphToViewport(node);
    const bounds = renderer.getMouseLayer().getBoundingClientRect();
    before = { x: node.x, y: node.y };
    camera = twoD.getRendererViewState();
    mouseLayer = renderer.getMouseLayer();
    start = { clientX: bounds.left + point.x, clientY: bounds.top + point.y };
    dispatch = (type, clientX, clientY, buttons) => mouseLayer.dispatchEvent(new win.PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, view: win,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX, clientY, button: 0, buttons,
    }));
    dispatch('pointermove', start.clientX, start.clientY, 0);
  });
  cy.window().should((win: any) => {
    expect(win.commonService.visuals.twoD.sigmaRenderer.hoveredNodeId, 'mouse is over the drag target').to.equal(nodeId);
  });
  cy.then(() => {
    dispatch('pointerdown', start.clientX, start.clientY, 1);
    // Go through the mouse captor and Sigma's drag manager. Emitting Sigma's
    // nodeDrag events directly would bypass the stale-graph regression.
    for (const fraction of [0.1, 0.4, 0.7, 1]) {
      dispatch('pointermove', start.clientX - 60 * fraction, start.clientY - 35 * fraction, 1);
    }
    dispatch('pointerup', start.clientX - 60, start.clientY - 35, 0);
  });
  cy.window().should((win: any) => {
    const twoD = win.commonService.visuals.twoD;
    const adapter = twoD.sigmaRenderer, renderer = adapter.getRenderer();
    const after = adapter.getGraph().getNodeAttributes(nodeId);
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    if (pinned) {
      expect(moved, 'pinned node stays in place').to.equal(0);
    } else {
      expect(moved, 'real pointer dragging moves the node').to.be.greaterThan(1);
      expect(twoD.nodePositions.get(nodeId), 'dragged coordinates are saved').to.deep.equal({ x: after.x, y: after.y });
      expect(twoD.getRendererViewState(), 'dragging does not pan the camera').to.deep.equal(camera);
    }
    expect(renderer.getGraphState().isDragging, 'drag state is cleared on release').to.equal(false);
  });
}

describe('Sigma pointer dragging after collapse changes', () => {
  it('drags ordinary and newly collapsed nodes while retaining the renderer and honoring pinning', () => {
    let adapter: any, renderer: any, firstAggregate: string, secondAggregate: string;
    cy.viewport(1440, 1000);
    cy.visit('/?skipEula=1&skipDemoSession=1&renderer=sigma');
    cy.get('#fileDropRef').selectFile([
      { contents: Cypress.Buffer.from('ID\nA\nB\nC\nD\nE'), fileName: 'DragNodes.csv', mimeType: 'text/csv' },
      { contents: Cypress.Buffer.from('source,target,distance\nA,B,0\nB,C,5\nC,D,1'), fileName: 'DragLinks.csv', mimeType: 'text/csv' },
    ], { force: true });
    cy.get('#launch', { timeout: 30000 }).should('not.be.disabled');
    cy.get('[data-testid="files-settings-button"]').click();
    cy.contains('.p-dialog-title', 'File Settings').parents('.p-dialog').within(() => {
      cy.get('#default-distance-metric').select('snps');
      cy.get('#default-distance-threshold').clear().type('5').trigger('change').blur();
      cy.get('#default-view').select('2D Network');
      cy.get('button.p-dialog-close-button').click();
    });
    cy.get('#launch').click();
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.commonService.visuals.twoD.isRendererReady()).to.equal(true);
      expect(win.commonService.visuals.twoD.sigmaRenderer.getGraph().order).to.equal(5);
    });
    cy.window().then((win: any) => {
      adapter = win.commonService.visuals.twoD.sigmaRenderer;
      renderer = adapter.getRenderer();
    });
    dragNode('D');

    cy.get('[data-testid="twod-settings-button"]').click();
    cy.contains('.p-dialog-title', '2D Network Settings').parents('.p-dialog').within(() => {
      cy.contains('p-accordion-header', 'Collapse Related Nodes').click();
      cy.get('#network-node-collapse-enabled').contains('span', 'Show').click();
      cy.get('button.p-dialog-close-button').click();
    });
    cy.window().should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.isRendererReady()).to.equal(true);
      expect(adapter.getGraph().order).to.equal(4);
      expect(twoD.sigmaRenderer).to.equal(adapter);
      expect(adapter.getRenderer()).to.equal(renderer);
    });
    cy.window().then(() => { firstAggregate = adapter.getGraph().nodes().find((id: string) => id.startsWith('twod-collapse-')); });
    dragNode('D');
    cy.then(() => dragNode(firstAggregate));

    cy.window().then((win: any) => win.commonService.visuals.twoD.onNodeCollapseThresholdDisplayedChange(1));
    cy.window().should((win: any) => {
      expect(win.commonService.visuals.twoD.isRendererReady()).to.equal(true);
      expect(adapter.getGraph().order).to.equal(3);
    });
    cy.window().then(() => {
      secondAggregate = adapter.getGraph().nodes().find((id: string) => id.startsWith('twod-collapse-') && id !== firstAggregate);
      expect(secondAggregate, 'a new collapsed ID was introduced').to.be.a('string');
    });
    cy.then(() => dragNode(secondAggregate));
    cy.window().then((win: any) => win.commonService.visuals.twoD.pinNodes());
    cy.then(() => dragNode(secondAggregate, true));
    cy.window().then((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      twoD.pinNodes();
      twoD.onNodeCollapseEnabledChange(false);
    });
    cy.window().should((win: any) => {
      expect(win.commonService.visuals.twoD.isRendererReady()).to.equal(true);
      expect(adapter.getGraph().order).to.equal(5);
      expect(adapter.getRenderer()).to.equal(renderer);
    });
    dragNode('D');
  });
});
