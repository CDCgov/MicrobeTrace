// cypress/e2e/files-plugin.cy.ts

describe('MicrobeTrace Application', () => {

  describe('Initial Load with Sample Data', () => {
    it('successfully loads the sample dataset when "Continue with Sample Dataset" is clicked', () => {
      cy.visit('/');
      cy.wait(6000); 

      cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
        .click({ force: true });
      
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
      
      // The app navigates away, but we can check the state to confirm data loaded.
      cy.window({ timeout: 10000 }).its('commonService.session.data.nodes')
        .should('have.length.greaterThan', 0);
    });
  });

  describe('File Handling and Processing', () => {
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
    });

    it('uploads a single valid FASTA file from the initial overlay', () => {
      const fileName = 'AngularTesting_seqs_TN93_small.fasta';
      cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
      
      cy.contains('#file-table .file-table-row', fileName, { timeout: 10000 }).should('be.visible');
      cy.get('#launch').should('not.be.disabled');

      cy.window().its('commonService.session.files').then((files) => {
        const fileExists = files.some(f => f.name === fileName);
        expect(fileExists).to.be.true;
        const fileInSession = files.find(f => f.name === fileName);
        expect(fileInSession.format).to.equal('fasta');
      });
    });

    it('removes a file from the session when the delete icon is clicked', () => {
      const fileName = 'AngularTesting_seqs_TN93_small.fasta';
      cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
      cy.contains('#file-table .file-table-row', fileName, { timeout: 10000 }).should('be.visible');

      cy.contains('.file-table-row', fileName)
        .find('.flaticon-delete-1')
        .click({ force: true });

      cy.get('#file-table').should('not.contain', fileName);
      
      cy.window().its('commonService.session.files').then((files) => {
        const fileExists = files.some(f => f.name === fileName);
        expect(fileExists).to.be.false;
      });
    });
  });

  describe('Post-Upload Interactions', () => {
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
      const fileName = 'AngularTesting_seqs_TN93_small.fasta';
      cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
      cy.get('#launch').should('not.be.disabled');
    });

    it('launches the 2D network view when the Launch button is clicked', () => {
      cy.get('#launch').click();

      // A good way to confirm the view has changed is to look for an element
      // that is unique to the 2D network view. Since we don't have the code for it,
      // we'll check that the "Files" tab is no longer the only active component.
      cy.get('.lm_tab.lm_active').should('not.have.text', 'Files');
      
      cy.window().its('commonService.session.network.isFullyLoaded').should('be.true');
    });

    it('opens settings, ensures metric is TN93, and changes the link threshold', () => {
      const tn93_default_threshold = 0.015;
      const newThreshold = '0.025';
      
      // 1. Open the settings panel
      cy.get('#tool-btn-container .flaticon-settings').click();
      cy.get('#file-settings-pane').contains('File Settings').should('be.visible');

      // 2. Set the metric to TN93
      cy.get('#default-distance-metric').select('tn93');

      // 3. ✨ STABILIZE: Assert that the app has finished reacting to the metric change
      // by confirming the threshold was reset to its default. This acts as a wait.
      cy.window().its('commonService.session.style.widgets.link-threshold')
        .should('equal', tn93_default_threshold);

      // 4. NOW, with the app stable, change the threshold value.
      cy.get('#default-distance-threshold')
        .invoke('val', newThreshold)
        .trigger('change');
        
      // 5. Close the panel
      cy.get('#tool-btn-container .flaticon-settings').click();
      cy.get('#file-settings-pane').should('not.be.visible');
      
      // 6. Verify the FINAL value is our new value.
      cy.window().its('commonService.session.style.widgets').then((widgets) => {
        expect(widgets['link-threshold']).to.equal(parseFloat(newThreshold));
      });
    });
  });
});
