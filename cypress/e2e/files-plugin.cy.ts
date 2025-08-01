describe('MicrobeTrace Application', () => {

  describe('Initial Load with Sample Data', () => {
    it('successfully loads the sample dataset when "Continue with Sample Dataset" is clicked', () => {
     cy.visit('/');
     cy.wait(6000); // Allow for initial application bootstrap
  
     cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
      .click({ force: true });
    
     cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
     // Check the service state to confirm data has been loaded
     cy.window({ timeout: 10000 }).its('commonService.session.data.nodes')
      .should('have.length.greaterThan', 0);
    });
   });
  
   describe('File Handling and Processing', () => {
    beforeEach(() => {
     cy.visit('/');
     cy.wait(6000);
    });
  
    it('uploads a single valid node list CSV file and auto-configures it', () => {
     const fileName = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
     cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
     cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
     cy.contains('#file-table .file-table-row', fileName, { timeout: 10000 }).should('be.visible');
     cy.get('#launch').should('not.be.disabled');
  
     // Verify file type is automatically set to Node
     cy.contains('.file-table-row', fileName).find('input[data-type="node"]').should('be.checked');
  
     // Verify key columns are correctly mapped
     cy.get(`#file-${fileName}-field-1`).should('have.value', '_id');
     cy.get(`#file-${fileName}-field-2`).should('have.value', 'seq');
  
     cy.window().its('commonService.session.files').then((files) => {
      const fileExists = files.some(f => f.name === fileName);
      expect(fileExists).to.be.true;
      const fileInSession = files.find(f => f.name === fileName);
      expect(fileInSession.format).to.equal('node');
     });
    });
   
    it('updates column mapping labels when file type is changed manually', () => {
     const fileName = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
     cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
     const fileRow = cy.contains('#file-table .file-table-row', fileName);
  
     // Initial state: Node
     fileRow.find('label').contains('ID').should('be.visible');
     fileRow.find('label').contains('Sequence').should('be.visible');
  
     // Change to Link type
     fileRow.find('input[data-type="link"]').click({ force: true });
  
     // Assert labels changed
     fileRow.find('label').contains('Source').should('be.visible');
     fileRow.find('label').contains('Target').should('be.visible');
     fileRow.find('label').contains('Distance').should('be.visible');
     cy.window().its('commonService.session.files').then(files => {
      expect(files.find(f => f.name === fileName).format).to.equal('link');
     });
  
     // Change back to Node type
     fileRow.find('input[data-type="node"]').click({ force: true });
  
     // Assert labels are back to original
     fileRow.find('label').contains('ID').should('be.visible');
     fileRow.find('label').contains('Sequence').should('be.visible');
    });
  
  
    it('removes a file from the session and disables launch button', () => {
     const fileName = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
     cy.get('#fileDropRef').selectFile(`cypress/fixtures/${fileName}`, { force: true });
     cy.contains('#file-table .file-table-row', fileName, { timeout: 10000 }).should('be.visible');
  
     cy.contains('.file-table-row', fileName)
      .find('.flaticon-delete-1')
      .click({ force: true });
  
     cy.get('#file-table').should('not.contain', fileName);
     cy.get('#launch').should('be.disabled');
    
     cy.window().its('commonService.session.files').then((files) => {
      const fileExists = files.some(f => f.name === fileName);
      expect(fileExists).to.be.false;
     });
    });
   });
  
   describe('Multi-File Scenarios and Launching', () => {
    beforeEach(() => {
     cy.visit('/');
     cy.wait(6000);
    });
   
    it('successfully uploads and configures a node list and a separate link list', () => {
      const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
      const linkFile = 'AngularTestingEpiLinkList_small.csv';
    
      // Upload first file
      cy.get('#fileDropRef').selectFile(`cypress/fixtures/${nodeFile}`, { force: true });
      cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');
    
      // Upload second file using the "Add File(s)" button
      cy.get('#data-files1').selectFile(`cypress/fixtures/${linkFile}`, { force: true });
      cy.contains('#file-table .file-table-row', linkFile).should('be.visible');
    
      // Verify node file configuration
      cy.contains('.file-table-row', nodeFile).find('input[data-type="node"]').should('be.checked');
      cy.get(`#file-${nodeFile}-field-1`).should('have.value', '_id');
      cy.get(`#file-${nodeFile}-field-2`).should('have.value', 'seq');
    
      // Verify link file configuration
      cy.contains('.file-table-row', linkFile).find('input[data-type="link"]').should('be.checked');
      cy.get(`#file-${linkFile}-field-1`).should('have.value', 'source');
      cy.get(`#file-${linkFile}-field-2`).should('have.value', 'target');
     
      cy.get('#launch').should('not.be.disabled');
    });
   
    it('launches a network correctly from separate node and link lists', () => {
      const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';
      const linkFile = 'AngularTestingEpiLinkList_small.csv';
      cy.get('#fileDropRef').selectFile(`cypress/fixtures/${nodeFile}`, { force: true });
      cy.get('#data-files1').selectFile(`cypress/fixtures/${linkFile}`, { force: true });
  
      cy.get('#launch').click();
      cy.get('.lm_tab.lm_active', {timeout: 20000}).should('contain.text', '2D Network');
  
      cy.window().its('commonService.session.data.nodes').should('have.length', 14);
      cy.window().its('commonService.session.data.links').should('have.length.greaterThan', 0);
  
      // Verify that data from both files was merged correctly
      cy.window().then((win) => {
        // Check a property from the node file
        const node = win.commonService.session.data.nodes.find(n => n._id === 'KF773425');
        expect(node.subtype).to.equal('C');
  
        // Check a property from the link file
        const link = win.commonService.session.data.links.find(l =>
          (l.source === 'KF773571' && l.target === 'KF773578') ||
          (l.source === 'KF773578' && l.target === 'KF773571')
        );
        expect(link.Contact).to.equal('Bar');
      });
    });
   });
  
   describe('File Settings Panel', () => {
    beforeEach(() => {
     cy.visit('/');
     cy.wait(6000);
     cy.get('#fileDropRef').selectFile('cypress/fixtures/AngularTesting_nodelist_withseqs_TN93_small (2).csv', { force: true });
     cy.get('#tool-btn-container .flaticon-settings').click();
     cy.get('#file-settings-pane').should('be.visible');
    });
   
    it('changes the distance metric to SNPs and verifies the threshold default', () => {
      const snps_default_threshold = 7;
     
      cy.get('#default-distance-metric').select('snps');
     
      cy.get('#default-distance-threshold').should('have.value', snps_default_threshold.toString());
  
      cy.window().its('commonService.session.style.widgets').then((widgets) => {
        expect(widgets['default-distance-metric']).to.equal('snps');
        expect(widgets['link-threshold']).to.equal(snps_default_threshold);
      });
    });
  
    it('changes the View to Launch setting and launches the correct view', () => {
      cy.get('#default-view').select('Table');
     
      cy.window().its('commonService.session.style.widgets.default-view')
       .should('equal', 'Table');
      
      // Close settings and launch
      cy.get('#tool-btn-container .flaticon-settings').click();
      cy.get('#launch').click();
     
      cy.get('.lm_tab.lm_active', {timeout: 10000}).should('contain.text', 'Table');
    });
   
    it('changes the link threshold for TN93 metric', () => {
     const tn93_default_threshold = 0.015;
     const newThreshold = '0.025';
    
     cy.get('#default-distance-metric').select('tn93');
  
     // Assert that the app has finished reacting to the metric change by checking the default threshold
     cy.window().its('commonService.session.style.widgets.link-threshold')
      .should('equal', tn93_default_threshold);
  
     // Now change the threshold value
     cy.get('#default-distance-threshold')
      .clear()
      .type(newThreshold)
      .trigger('change');
     
     // Close the panel
     cy.get('#tool-btn-container .flaticon-settings').click();
     cy.get('#file-settings-pane').should('not.be.visible');
    
     // Verify the new value is set
     cy.window().its('commonService.session.style.widgets').then((widgets) => {
      expect(widgets['link-threshold']).to.equal(parseFloat(newThreshold));
     });
    });
   });
  });
  
  