describe('Sigma renderer proof of concept', () => {
  it('keeps the complete large graph client-side while changing only drawn edge detail', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&largeDemo=1&renderer=sigma');
    cy.contains('button', 'Continue with Large Network Demo', { timeout: 30000 }).click({ force: true });

    cy.get('[data-testid="sigma-poc-summary"]', { timeout: 120000 })
      .should('be.visible')
      .and('contain.text', '500 nodes')
      .and('contain.text', '124,750 links resident');
    cy.get('[data-testid="sigma-network-poc"] canvas').should('have.length.at.least', 2);
    cy.get('#network-guardrail-warning')
      .should('contain.text', 'all 124,750 threshold-qualified links are resident in the browser');

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      expect(adapter, 'Sigma adapter').to.exist;
      expect(adapter.getGraph().order).to.equal(500);
      expect(adapter.getGraph().size).to.equal(124750);
      expect(adapter.getRenderer().getSettings().enableNodeDrag).to.equal(true);
      expect(adapter.getRenderer().getSettings().hideEdgesOnMove).to.equal(false);
      const layoutGroups = new Set<string>();
      adapter.getGraph().forEachNode((_node: string, attributes: any) => {
        if (attributes.group) layoutGroups.add(String(attributes.group));
      });
      expect(layoutGroups.size).to.equal(5);
      const overview = adapter.getSummary();
      expect(adapter.getDisplayGraph().size).to.equal(overview.drawnLinkCount);
      expect(adapter.getRenderer().getGraph().size).to.equal(overview.drawnLinkCount);
      expect(overview.edgeDetailMode).to.equal('overview');
      expect(overview.drawnLinkCount).to.be.lessThan(overview.residentLinkCount);
      cy.wrap(overview.drawnLinkCount).as('overviewDrawnLinkCount');
    });

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      const renderer = adapter.getRenderer();
      const camera = renderer.getCamera();
      const initialCamera = camera.getState();
      win.sigmaPocInitialCamera = initialCamera;
      win.sigmaPocZoomRatio = initialCamera.ratio * 0.4;
      camera.setState({ ...initialCamera, ratio: win.sigmaPocZoomRatio });
    });
    cy.get('@overviewDrawnLinkCount').then(overviewDrawnLinkCount => {
      cy.window({ timeout: 10000 }).should((win: any) => {
        const adapter = win.sigmaPocInstance;
        const zoomed = adapter.getSummary();
        expect(zoomed.drawnLinkCount).to.be.greaterThan(Number(overviewDrawnLinkCount));
        expect(adapter.getDisplayGraph().size).to.equal(zoomed.drawnLinkCount);
        expect(adapter.getRenderer().getCamera().getState().ratio).to.be.closeTo(win.sigmaPocZoomRatio, 0.000001);
      }).then((win: any) => {
        const adapter = win.sigmaPocInstance;
        adapter.getRenderer().getCamera().setState(win.sigmaPocInitialCamera);
      });
    });
    cy.wait(350);

    cy.get('[data-testid="sigma-edge-detail"]').click();
    cy.get('@overviewDrawnLinkCount').then(overviewDrawnLinkCount => {
      cy.window().then((win: any) => {
        const detail = win.sigmaPocInstance.getSummary();
        expect(detail.edgeDetailMode).to.equal('detail');
        expect(detail.drawnLinkCount).to.be.greaterThan(Number(overviewDrawnLinkCount));
        expect(detail.residentLinkCount).to.equal(124750);
      });
    });

    cy.get('[data-testid="sigma-edge-overview"]').click();
    cy.get('[data-testid="sigma-poc-statistics-row"]')
      .should('contain.text', 'Links drawn / resident')
      .and('contain.text', '124,750');
  });
});
