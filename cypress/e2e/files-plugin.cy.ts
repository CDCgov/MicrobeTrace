describe('File Handling and Processing', () => {
    // This runs before each test case in this describe block
    beforeEach(() => {
      // Visit the base URL defined in cypress.config.ts
      cy.visit('/');
      // From your HTML, the overlay covers the app on start.
      // We'll click the "Continue with Sample Dataset" button to dismiss it and start fresh.
      cy.get('button').contains('Continue with Sample Dataset').click();
      // Your test plan mentions resetting the session, so we'll do that here.
      cy.get('.navbar-item').contains('File').click();
      cy.get('button[mat-menu-item]').contains('Save').click(); // A proxy to get the menu to close and reset state, may need adjustment.
    });
  
    /**
     * Test Case 1.1: Uploading a single valid file
     */
    it('uploads a single valid FASTA file and displays it in the table', () => {
      const fileName = 'sample.fasta';
  
      // 1. Get the file input and select the fixture file. Your input is hidden, so force is needed.
      // The input ID from files-plugin.component.html is 'data-files1'.
      cy.get('#data-files1').selectFile(`cypress/fixtures/${fileName}`, { force: true });
  
      // 2. Assert that the file appears in the UI's file table.
      // The file table container has id 'file-table'. Rows have class '.file-table-row'.
      cy.get('#file-table .file-table-row').should('have.length', 1);
      cy.get('#file-table .file-table-row').should('contain', fileName);
  
      // 3. Check that the file's metadata is correctly stored in commonService.
      cy.window().its('commonService').then((commonService) => {
        const files = commonService.session.files;
        expect(files).to.have.length(1);
        expect(files[0].name).to.equal(fileName);
        expect(files[0].format).to.equal('fasta'); // Assumes format detection works
      });
    });
  
    /**
     * Test Case 1.4: Removing a file
     */
    it('removes a file from the session when the delete icon is clicked', () => {
      const fileName = 'sample.fasta';
      cy.get('#data-files1').selectFile(`cypress/fixtures/${fileName}`, { force: true });
  
      // Ensure the file is there before we try to remove it
      cy.get('#file-table .file-table-row').should('contain', fileName);
  
      // 1. Click the "Remove" icon next to the file.
      // The icon has the class 'flaticon-delete-1'
      cy.get('.file-table-row').contains(fileName)
        .find('.flaticon-delete-1')
        .click();
  
      // 2. Assert that the file is removed from the UI.
      cy.get('#file-table .file-table-row').should('not.exist');
  
      // 3. Verify the file is removed from the service.
      cy.window().its('commonService').then((commonService) => {
        expect(commonService.session.files).to.be.empty;
      });
    });
  });