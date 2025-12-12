// cypress/e2e/files-plugin.cy.ts
/// <reference types="cypress" />

describe('File Handling and Processing', () => {
  const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
  const linkFile = 'AngularTestingEpiLinkList_small.csv';

  beforeEach(() => {
    cy.visit('/');
    // The initial wait is to allow the default session to load,
    // which we will clear by uploading our own file.
    cy.wait(2000); 
  });

  it('uploads multiple filesadn then sets the datatype and the fields', () => {
    // mostly an example of this function
    cy.loadFiles([
      {name: 'AngularTesting_DistanceMatrix_TN93_small.xlsx', datatype: 'matrix'},
      {name: 'AngularTesting_seqs_TN93_small.fasta', datatype: 'fasta'},
      {name: 'AngularTesting_nodelist_withseqs_TN93_small (2).csv', datatype: 'node', field1: 'seq', field2: '_id'}
    ])
  })

  it('uploads a single node list, auto-configures it, and enables launch', () => {
    // Upload the file from the overlay
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

    // Assert the file row is visible
    cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');
    cy.get('#launch').should('not.be.disabled');

    // Assert file type is auto-detected as "Node"
    cy.contains('.file-table-row', nodeFile).find('input[data-type="node"]').should('be.checked');

    // Use attribute selector to handle special characters in the ID
    cy.get(`[id="file-${nodeFile}-field-1"]`).should('have.value', '_id');
    cy.get(`[id="file-${nodeFile}-field-2"]`).should('have.value', 'seq');
  });

  it('updates column mapping labels when file type is changed manually', () => {
    cy.attach_file('#fileDropRef', nodeFile);
    
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

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
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

    // Ensure the file row exists
    cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');

    // Click the remove button
    cy.contains('.file-table-row', nodeFile).find('.flaticon-delete-1').click();

    // Assert the file row is gone and the prompt is back
    cy.contains('#file-table .file-table-row', nodeFile).should('not.exist');
    cy.get('#file-prompt').should('be.visible');
  });

  it('opens and closes the sequence controls modal', () => {
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

    // The p-dialog component exists in the DOM but isn't visible
    cy.get('#sequence-controls-modal').should('not.be.visible');

    // Click button to open sequence controls
    cy.contains('button', 'Sequence Controls').click();
    
    // Assert that content inside the modal is now visible
    cy.get('#sequence-controls-modal').contains('Alignment').should('be.visible');

    // Click the "Confirm" button to close it
    cy.get('#sequence-controls-modal').contains('button', 'Confirm').click();
    cy.get('#sequence-controls-modal').should('not.be.visible');
  });

  it('opens and closes the file settings modal', () => {
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

    // Modal should not be visible initially
    cy.get('#file-settings-pane').should('not.be.visible');

    // Click the settings icon to open the modal
    cy.get('a[title="Settings"]').click();
    cy.get('#file-settings-pane').contains('Distance Metric').should('be.visible');

    // **FIX**: Target the clickable button, not the inner icon span
    cy.get('#file-settings-pane').find('button.p-dialog-close-button').click();
    
    cy.get('#file-settings-pane').should('not.be.visible');
  });
  
  
  it('launches a network from separate node and link lists', () => {
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
    cy.attach_file('#data-files1', linkFile); // Use the "Add File(s)" button

    cy.get('#launch').click();
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');

    cy.window().its('commonService.session.data.nodes').should('have.length', 14);
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

describe('Files Plugin - Settings', () => {
 const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';

 beforeEach(() => {
   cy.visit('/');
   cy.wait(2000); 
   cy.attach_file('#fileDropRef', nodeFile);
   cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
   cy.get('#tool-btn-container a[title="Settings"]').click();
 });

 it('should change the Distance Metric and update the session', () => {
   cy.window().its('commonService.session.style.widgets.default-distance-metric').should('equal', 'snps');
   cy.get('#default-distance-metric').select('tn93');
   cy.window().its('commonService.session.style.widgets.default-distance-metric').should('equal', 'tn93');
 });

 it('should change the Ambiguity Resolution Strategy and update the session', () => {
   cy.window().its('commonService.session.style.widgets.ambiguity-resolution-strategy').should('equal', 'AVERAGE');
   cy.get('#default-distance-metric').select('tn93');
   cy.get('#ambiguity-resolution-strategy').select('RESOLVE');
   cy.window().its('commonService.session.style.widgets.ambiguity-resolution-strategy').should('equal', 'RESOLVE');
 });

//  it('should show and update the Ambiguity Threshold when strategy is RESOLVE', () => {
//   const newThreshold = '0.025';
//   cy.get('#ambiguity-threshold-row').should('not.be.visible');
//   cy.get('#ambiguity-resolution-strategy').select('RESOLVE');
//   cy.get('#ambiguity-threshold-row').should('be.visible');
//   cy.get('#ambiguity-threshold').clear().type(newThreshold);
//   cy.window().its('commonService.session.style.widgets.ambiguity-threshold').should('equal', parseFloat(newThreshold));
//  });

 it('should change the Link Threshold and update the session', () => {
   const newThreshold = '4';
   // snps initally
   cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', 164);
  cy.get('#default-distance-threshold').clear().type(newThreshold);
  cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', parseFloat(newThreshold));
 });

  it('should change the View to Launch and update the session', () => {
   cy.window().its('commonService.session.style.widgets.default-view').should('equal', '2d_network');
   cy.get('#default-view').select('Table');
   cy.window().its('commonService.session.style.widgets.default-view').should('equal', 'Table');
 });
});