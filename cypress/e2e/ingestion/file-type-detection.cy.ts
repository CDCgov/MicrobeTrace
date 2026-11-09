/// <reference types="cypress" />

describe('File Type Detection', () => {
  const metadataFile = 'CaseMetadata.csv';
  const mapleFile = 'simple-alignment.maple';

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('auto-detects metadata tables as node files and preserves attributes', () => {
    cy.attach_file('#fileDropRef', metadataFile);

    cy.contains('#file-table .file-table-row', metadataFile, { timeout: 20000 }).as('metadataRow');
    cy.get('@metadataRow').find('input[data-type="node"]').should('be.checked');
    cy.get('@metadataRow').find('label').contains('ID').should('be.visible');
    cy.get('@metadataRow').find('label').contains('Sequence').should('be.visible');
    cy.get(`[id="file-${metadataFile}-field-1"]`).should('have.value', 'Case ID');
    cy.get(`[id="file-${metadataFile}-field-2"]`).should('have.value', 'None');

    cy.get('#launch').click({ force: true });

    cy.window({ timeout: 20000 }).its('commonService.session.data.nodes').should((nodes: any[]) => {
      expect(nodes.map((node: any) => node._id)).to.include.members(['CASE-001', 'CASE-002', 'CASE-003']);
    });

    cy.window({ timeout: 20000 }).its('commonService.session.data.nodeFields').should((fields: string[]) => {
      expect(fields).to.include.members(['Lineage', 'Risk Factor']);
    });

    cy.window().then((win) => {
      const metadata = win.commonService.session.files.find((file: any) => file.name === metadataFile);
      const node = win.commonService.session.data.nodes.find((item: any) => item._id === 'CASE-001');

      expect(metadata.format).to.equal('node');
      expect(win.commonService.session.data.links).to.have.length(0);
      expect(node.Lineage).to.equal('A');
      expect(node['Risk Factor']).to.equal('Healthcare');
    });
  });

  it('auto-detects and expands MAPLE sparse alignments', () => {
    cy.attach_file('#fileDropRef', mapleFile, 'text/x-maple');

    cy.contains('#file-table .file-table-row', mapleFile, { timeout: 20000 }).as('mapleRow');
    cy.get('@mapleRow').find('input[data-type="maple"]').should('be.checked');

    cy.get('#launch').click({ force: true });

    cy.window({ timeout: 30000 }).should((win) => {
      const commonService = (win as any).commonService;
      const byId = new Map(commonService.session.data.nodes.map((node: any) => [node._id, node.seq]));

      expect(byId.get('sample-a')).to.equal('AACCGGTT');
      expect(byId.get('sample-b')).to.equal('ATCCNNTT');
      expect(byId.get('sample-c')).to.equal('AA---GTT');
      expect(commonService.session.files[0].format).to.equal('maple');
    });
  });
});
