describe('Sigma docked-table resize', () => {
  it('repaints the network after the docked key tables are closed', () => {
    cy.visit('/?skipEula=1');
    cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
      .should('be.visible')
      .click({ force: true });
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');

    cy.get('[data-testid="network-render-summary"]', { timeout: 20000 })
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links shown');
    cy.get('.lm_tab[title="Docked Key Tables"] > .lm_close_tab')
      .should('be.visible');

    cy.window().then(win => {
      const adapter = (win as any).commonService.visuals.twoD.sigmaRenderer;
      const sigma = adapter.getRenderer();
      expect(sigma, 'Sigma renderer').to.exist;
      cy.spy(sigma, 'refresh').as('sigmaRefreshAfterDockClose');
    });

    cy.get('[data-testid="sigma-network"] canvas.sigma-stage')
      .then($stage => cy.wrap($stage[0].width, { log: false }).as('initialStageWidth'));
    cy.get('.lm_tab[title="Docked Key Tables"] > .lm_close_tab')
      .click({ force: true });
    cy.get('.lm_tab[title="Docked Key Tables"]').should('not.exist');

    cy.get('@initialStageWidth').then(initialWidth => {
      cy.get('[data-testid="sigma-network"] canvas.sigma-stage', { timeout: 10000 })
        .should($stage => {
          expect($stage[0].width, 'expanded WebGL stage width')
            .to.be.greaterThan(Number(initialWidth));
        });
    });
    cy.get('@sigmaRefreshAfterDockClose').should('have.been.calledWithMatch', {
      partialGraph: { nodes: [], edges: [] },
      skipIndexation: true,
      schedule: false,
    });
    cy.window().then(win => {
      const adapter = (win as any).commonService.visuals.twoD.sigmaRenderer;
      expect(adapter.getGraph().order, 'resident nodes after dock close').to.equal(33);
    });
  });
});
