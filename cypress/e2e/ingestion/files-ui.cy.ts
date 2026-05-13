// cypress/e2e/ingestion/files-ui.cy.ts
/// <reference types="cypress" />

import { byTestId, testIds } from '../../support/selectors';

describe('File Handling and Processing', () => {
  const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_BS.csv';
  const linkFile = 'AngularTesting_Epi_linklist_BS.csv';
  const loadNodeFile = () => cy.loadFiles([{ name: nodeFile, datatype: 'node' }]);
  const hideLocalUrlWarning = () => {
    cy.get('body').then(($body) => {
      if (!$body.find('#url-warning-div').length) return;

      cy.get('#url-warning-div').invoke('hide');
    });
  };

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('keeps welcome overlay actions reachable on short screens', () => {
    cy.viewport(320, 240);
    hideLocalUrlWarning();

    cy.get('#add-data-container', { timeout: 10000 }).should(($container) => {
      expect(Number($container.css('opacity'))).to.be.greaterThan(0.9);
    });

    cy.get('#overlay')
      .should('be.visible')
      .then(($overlay) => {
        const overlay = $overlay[0] as HTMLElement;

        expect(overlay.scrollHeight).to.be.greaterThan(overlay.clientHeight);
      });

    cy.get('#overlay')
      .scrollTo('bottom')
      .should(($overlay) => {
        expect(($overlay[0] as HTMLElement).scrollTop).to.be.greaterThan(0);
      });

    cy.contains('a', 'Visit MicrobeTrace Classic').should('be.visible');
    cy.get(byTestId(testIds.appSampleDatasetButton)).should('be.visible');
  });

  it('keeps startup overlay above key table dialogs', () => {
    cy.get('#overlay').should('be.visible');

    cy.get('#global-settings-node-color-table').should(($tableDialog) => {
      const overlayZIndex = Number(Cypress.$('#overlay').css('z-index'));
      const tableZIndex = Number($tableDialog.css('z-index'));

      expect(tableZIndex, 'node color table z-index').to.be.lessThan(overlayZIndex);
    });
  });

  it('uploads multiple files and then sets the datatype and the fields', () => {
    // mostly an example of this function
    cy.loadFiles([
      {name: 'AngularTesting_DistanceMatrix_TN93_BS.xlsx', datatype: 'matrix'},
      {name: 'AngularTesting_seqs_TN93_BS.fasta', datatype: 'fasta'},
      {name: 'AngularTesting_nodes_Map.csv', datatype: 'node', field1: 'seq', field2: '_id'}
    ])
  })

  it('uploads a single node list, auto-configures it, and enables launch', () => {
    loadNodeFile();

    // Assert the file row is visible
    cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');
    cy.get('#file-prompt').should('not.exist');
    cy.get('#launch').should('not.be.disabled');

    // Assert file type is auto-detected as "Node"
    cy.contains('.file-table-row', nodeFile).find('input[data-type="node"]').should('be.checked');

    // Use attribute selector to handle special characters in the ID
    cy.get(`[id="file-${nodeFile}-field-1"]`).should('have.value', '_id');
    cy.get(`[id="file-${nodeFile}-field-2"]`).should('have.value', 'seq');
  });

  it('uploads via the welcome overlay input and launches without hitting the error boundary', () => {
    cy.attach_files('#fileDropRef', [nodeFile, linkFile]);

    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.contains('#file-table .file-table-row', nodeFile, { timeout: 20000 }).should('be.visible');
    cy.contains('#file-table .file-table-row', linkFile, { timeout: 20000 }).should('be.visible');
    cy.get('body').should('not.contain.text', 'Unexpected application error');
    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');
  });

  it('updates column mapping labels when file type is changed manually', () => {
    loadNodeFile();

    // Initial state: Node - We re-query the row for each assertion for robustness.
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label').contains('ID').should('be.visible');
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label').contains('Sequence').should('be.visible');
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label:contains("Distance")').parent().should('not.be.visible');

    // Change to Link type
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('input[data-type="link"]').click({ force: true });

    // Assert labels changed
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label').contains('Source').should('be.visible');
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label').contains('Target').should('be.visible');
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label').contains('Distance').should('be.visible');
    cy.contains('#file-table .file-table-row', nodeFile)
      .find('label:contains("Sequence")').should('not.exist');
  });

  it('allows a file to be removed', () => {
    loadNodeFile();

    // Ensure the file row exists
    cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');

    // Click the remove button
    cy.contains('.file-table-row', nodeFile).find('.flaticon-delete-1').click({ force: true });

    // Assert the file row is gone and the prompt is back
    cy.contains('#file-table .file-table-row', nodeFile).should('not.exist');
    cy.get('#file-prompt').should('be.visible');
  });

  it('opens and closes the sequence controls modal', () => {
    loadNodeFile();

    // The p-dialog component exists in the DOM but isn't visible
    cy.get('#sequence-controls-modal').should('not.be.visible');

    // Click button to open sequence controls
    cy.contains('button', 'Sequence Controls').click({ force: true });
    
    // Assert that the dialog content is present after opening.
    cy.get('#sequence-controls-modal').should('contain.text', 'Alignment');

    // Click the "Confirm" button to close it
    cy.get('#sequence-controls-modal').contains('button', 'Confirm').click({ force: true });
    cy.get('#sequence-controls-modal').should('not.be.visible');
  });

  it('opens and closes the file settings modal', () => {
    loadNodeFile();

    // Modal should not be visible initially
    cy.get('#file-settings-pane').should('not.be.visible');

    // Click the settings icon to open the modal
    cy.get(byTestId(testIds.filesSettingsButton)).click({ force: true });
    cy.get('#file-settings-pane').should('contain.text', 'Distance Metric');

    // **FIX**: Target the clickable button, not the inner icon span
    cy.get('#file-settings-pane').find('button.p-dialog-close-button').click({ force: true });
    
    cy.get('#file-settings-pane').should('not.be.visible');
  });

  it('loads a compressed MicrobeTrace session zip', () => {
    cy.attach_files('#fileDropRef', ['outbreaknorm_session.zip'], ['application/zip']);

    cy.window({ timeout: 20000 })
      .its('commonService.session.data.nodes.length')
      .should('equal', 80);

    cy.window({ timeout: 20000 })
      .its('commonService.session.data.links.length')
      .should('equal', 1078);

    cy.window({ timeout: 20000 })
      .its('commonService.session.layout.content')
      .should((content: any[]) => {
        expect(content.map((item: any) => item.type)).to.deep.equal([
        '2D Network',
        'geo_map',
        'table'
        ]);
      });
  });
  
  
  it('launches a network from separate node and link lists', () => {
    cy.loadFiles([
      { name: nodeFile, datatype: 'node' },
      { name: linkFile, datatype: 'link' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');

    cy.window().its('commonService.session.data.nodes').should('have.length.greaterThan', 0);
    cy.window().its('commonService.session.data.links').should('have.length.greaterThan', 0);

    // Verify data from both files was merged
    cy.window().then((win) => {
      const node = win.commonService.session.data.nodes.find(n => n._id === 'KF773425');
      expect(node.subtype).to.equal('C');

      const link = win.commonService.session.data.links.find(l => 
        (l.source === 'KF773571' && l.target === 'KF773578')
      );
      expect(link.Contact).to.equal('Bar');
    });
  });
});
