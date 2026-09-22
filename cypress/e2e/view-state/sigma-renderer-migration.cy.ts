const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });

  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
};

describe('Sigma renderer migration', () => {
  it('renders the sample network with Sigma when WebGL2 is available', () => {
    cy.visit('/?renderer=sigma');
    loadSampleDataset();

    cy.get('[data-testid="sigma-migration-banner"]', { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Sigma WebGL renderer');
    cy.get('[data-testid="sigma-network"]')
      .should('be.visible')
      .find('canvas.sigma-stage')
      .should('exist');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="sigma-renderer-summary"]')
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links resident')
      .and('contain.text', '74 links drawn');

    cy.contains('.sigma-detail-controls button', 'Detail')
      .click({ force: true })
      .should('have.class', 'active');
    cy.get('[data-testid="sigma-migration-banner"]')
      .should('not.contain.text', 'fallback');
  });

  it('uses the Cytoscape Canvas fallback when WebGL2 is unavailable', () => {
    cy.visit('/?renderer=sigma', {
      onBeforeLoad(win) {
        const originalGetContext = win.HTMLCanvasElement.prototype.getContext;
        (win.HTMLCanvasElement.prototype as any).getContext = function (
          contextId: string,
          ...args: unknown[]
        ) {
          if (contextId === 'webgl2') {
            return null;
          }

          return (originalGetContext as any).call(this, contextId, ...args);
        };
      },
    });
    loadSampleDataset();

    cy.get('[data-testid="sigma-migration-banner"]', { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Cytoscape Canvas fallback')
      .and('contain.text', 'WebGL 2 is unavailable');
    cy.get('#cy').should('be.visible');
    cy.get('[data-testid="sigma-network"]').should('not.exist');
  });
});
