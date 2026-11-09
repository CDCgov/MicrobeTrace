/// <reference types="cypress" />

describe('File Type Detection', () => {
  const metadataFile = 'CaseMetadata.csv';
  const mapleFile = 'simple-alignment.maple';
  const moltenFile = 'molten-distances.tsv';

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

  it('auto-detects Molten TSV distances and normalizes them as undirected links', () => {
    cy.attach_file('#fileDropRef', moltenFile, 'text/tab-separated-values');

    cy.contains('#file-table .file-table-row', moltenFile, { timeout: 20000 }).as('moltenRow');
    cy.get('@moltenRow').find('input[data-type="link"]').should('be.checked');
    cy.get(`[id="file-${moltenFile}-field-1"]`).should('have.value', 'sequence_1');
    cy.get(`[id="file-${moltenFile}-field-2"]`).should('have.value', 'sequence_2');
    cy.get(`[id="file-${moltenFile}-field-3"]`).should('have.value', 'distance');

    cy.get('#launch').click({ force: true });

    cy.window({ timeout: 30000 }).should((win) => {
      const commonService = (win as any).commonService;
      const nodeIds = commonService.session.data.nodes.map((node: any) => node._id).sort();
      const links = commonService.session.data.links;
      const linkKeys = links.map((link: any) => [link.source, link.target].sort().join('--')).sort();

      expect(nodeIds).to.deep.equal(['sample-a', 'sample-b', 'sample-c']);
      expect(linkKeys).to.deep.equal(['sample-a--sample-b', 'sample-b--sample-c']);
      expect(links.map((link: any) => Number(link.distance)).sort()).to.deep.equal([1, 2]);
      expect(commonService.session.files[0]).to.include({
        format: 'link',
        field1: 'sequence_1',
        field2: 'sequence_2',
        field3: 'distance',
      });
    });
  });
});
