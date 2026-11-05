/// <reference types="cypress" />

describe('HIV-TRACE JSON ingestion', () => {
  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('loads compact HIV-TRACE network results', () => {
    cy.attach_file('#fileDropRef', 'hivtrace-compact-network.json', 'application/json');

    cy.window().should((win: any) => {
      const { nodes, links } = win.commonService.session.data;

      expect(nodes, 'imported nodes').to.have.length(2);
      expect(links, 'imported links').to.have.length(1);
      expect(nodes.map((node: any) => node._id)).to.deep.equal(['sample-a', 'sample-b']);
      expect(nodes.map((node: any) => node.city)).to.deep.equal(['Atlanta', 'Baltimore']);
      expect(links[0].source).to.equal('sample-a');
      expect(links[0].target).to.equal('sample-b');
      expect(links[0].distance).to.equal(0.0125);
      expect(links[0].directed).to.equal(false);
    });
  });
});
