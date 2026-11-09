/// <reference types="cypress" />

const assertCenteredLayout = (win: any, mode: string): void => {
  const twoD = win.commonService.visuals.twoD;
  expect(twoD.isRendererReady(), 'layout finished rendering').to.equal(true);
  const adapter = twoD.sigmaRenderer;
  const renderer = adapter.getRenderer();
  const graph = adapter.getGraph();
  const { width, height } = renderer.getDimensions();
  expect(graph.order, 'all sample nodes retained').to.equal(33);
  expect(graph.size, 'all sample links retained').to.equal(74);
  expect(adapter.getSummary().edgeDetailMode, 'chosen link detail retained').to.equal(mode);

  const points = graph.nodes().map((id: string) => {
    const point = renderer.graphToViewport(graph.getNodeAttributes(id));
    const radius = renderer.scaleSize(renderer.getNodeDisplayData(id).size);
    expect(point.x - radius, `${id} left edge`).to.be.at.least(0);
    expect(point.x + radius, `${id} right edge`).to.be.at.most(width);
    expect(point.y - radius, `${id} top edge`).to.be.at.least(0);
    expect(point.y + radius, `${id} bottom edge`).to.be.at.most(height);
    return point;
  });
  const centerX = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2;
  const centerY = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
  expect(centerX, 'layout horizontally centered').to.be.closeTo(width / 2, 1);
  expect(centerY, 'layout vertically centered').to.be.closeTo(height / 2, 1);
};

const displaceCamera = (): void => {
  cy.window().then((win: any) => {
    const twoD = win.commonService.visuals.twoD;
    const state = twoD.getRendererViewState();
    twoD.setRendererViewState({
      ...state,
      centerX: state.centerX + state.graphUnitsPerPixel * 2000,
      centerY: state.centerY - state.graphUnitsPerPixel * 1000,
      graphUnitsPerPixel: state.graphUnitsPerPixel * 0.4,
    });
  });
};

const recalculateAndCheck = (mode: string): void => {
  cy.get('[data-testid="twod-recalculate-layout-button"]').click();
  cy.window({ timeout: 30000 }).should(win => assertCenteredLayout(win, mode));
  // The fitted view must also replace the old saved camera after its debounce.
  cy.window().should((win: any) => {
    const state = win.commonService.visuals.twoD.getRendererViewState();
    const saved = win.commonService.session.meta.rendererViewState;
    expect(saved.centerX, 'saved fitted center x').to.be.closeTo(state.centerX, 0.01);
    expect(saved.centerY, 'saved fitted center y').to.be.closeTo(state.centerY, 0.01);
    expect(saved.graphUnitsPerPixel, 'saved fitted scale').to.be.closeTo(state.graphUnitsPerPixel, 0.001);
    expect(saved.edgeDetailMode).to.equal(mode);
  });
};

describe('Sigma layout centering', () => {
  beforeEach(() => {
    cy.viewport(1600, 1000);
    cy.visit('/?skipEula=1');
    cy.get('[data-testid="app-sample-dataset-button"]', { timeout: 15000 }).click();
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.commonService.visuals.twoD.isRendererReady()).to.equal(true);
      expect(win.commonService.visuals.twoD.sigmaRenderer.getGraph().order).to.equal(33);
    });
  });

  it('keeps every node visible after repeated recalculations with All links', () => {
    cy.get('[data-testid="network-detail-all"]').click();
    displaceCamera();
    for (let repeat = 0; repeat < 6; repeat++) recalculateAndCheck('all');
    cy.get('[data-testid="network-detail-all"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('recenters panned and zoomed views in Detailed and Overview modes', () => {
    [ ['detailed', 'detail'], ['overview', 'overview'] ].forEach(([control, mode]) => {
      cy.get(`[data-testid="network-detail-${control}"]`).click();
      displaceCamera();
      recalculateAndCheck(mode);
    });
  });

  it('retains a link detail choice made while the previous camera view is waiting to save', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']);
    cy.window().then((win: any) => {
      const camera = win.commonService.visuals.twoD.sigmaRenderer.getRenderer().getCamera();
      camera.setState({ x: camera.getState().x + 0.25 });
    });
    cy.get('[data-testid="network-detail-all"]').click();
    cy.tick(150);
    cy.window().should((win: any) => {
      expect(win.commonService.session.meta.rendererViewState.edgeDetailMode).to.equal('all');
      expect(win.commonService.visuals.twoD.widgets['network-edge-detail-mode']).to.equal('all');
    });
    cy.clock().then(clock => clock.restore());
    recalculateAndCheck('all');
  });
});
