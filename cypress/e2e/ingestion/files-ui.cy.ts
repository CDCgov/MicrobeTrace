// cypress/e2e/ingestion/files-ui.cy.ts
/// <reference types="cypress" />

import { byTestId, testIds } from '../../support/selectors';

describe('File Handling and Processing', () => {
  const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_BS.csv';
  const compatibleNodeFile = 'AngularTesting_nodes_Map.csv';
  const linkFile = 'AngularTesting_Epi_linklist_BS.csv';
  const additionalNodeFile = compatibleNodeFile;
  const loadNodeFile = () => cy.loadFiles([{ name: nodeFile, datatype: 'node' }]);

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('keeps welcome overlay actions reachable on short screens', () => {
    cy.viewport(320, 240);

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

  it('renders quote-bearing file names as text and keeps file controls functional', () => {
    const unsafeFileName = 'Nodes" autofocus onfocus="window.__mtInjected=true".csv';
    const csvContents = '_id,seq\nA,AAAA\nB,CCCC\n';

    cy.get('#fileDropRef').then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      const win = input.ownerDocument.defaultView as Window & typeof globalThis & { __mtInjected?: boolean };
      const data = new win.DataTransfer();
      const file = new win.File([csvContents], unsafeFileName, { type: 'text/csv' });

      win.__mtInjected = false;
      data.items.add(file);
      input.files = data.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    });

    cy.contains('#file-table .file-table-row', unsafeFileName, { timeout: 20000 })
      .as('unsafeFileRow')
      .should('be.visible');
    cy.get('@unsafeFileRow')
      .find('.file-name > span.p-1')
      .should('have.text', unsafeFileName);
    cy.get('@unsafeFileRow').find('[autofocus]').should('not.exist');
    cy.get('@unsafeFileRow').find('[onfocus]').should('not.exist');
    cy.get('@unsafeFileRow').find('input[type="radio"]').should('have.length', 7);
    cy.window().its('__mtInjected').should('equal', false);

    cy.get('@unsafeFileRow').find('input[data-type="node"]').should('be.checked');
    cy.get('@unsafeFileRow').find('input[data-type="link"]').click({ force: true });
    cy.get('@unsafeFileRow').find('select').eq(0).select('seq', { force: true });

    cy.window().then((win: any) => {
      const file = win.commonService.session.files.find((sessionFile: any) => sessionFile.name === unsafeFileName);
      expect(file.format).to.equal('link');
      expect(file.field1).to.equal('seq');
      expect(file.field2).to.equal('seq');
    });
  });

  it('uploads via the welcome overlay input and launches without hitting the error boundary', () => {
    cy.attach_files('#fileDropRef', [nodeFile, linkFile]);

    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.contains('#file-table .file-table-row', nodeFile, { timeout: 20000 }).should('be.visible');
    cy.contains('#file-table .file-table-row', linkFile, { timeout: 20000 }).should('be.visible');
    cy.get('.runtime-error-banner').should('not.exist');
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

  it('appends files dropped onto the Files tab after a network has launched', () => {
    cy.loadFiles([
      { name: nodeFile, datatype: 'node' },
      { name: linkFile, datatype: 'link' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');

    cy.get(byTestId(testIds.appFileMenuButton)).click({ force: true });
    cy.contains('[role="menuitem"]', 'Add Data').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', 'Files');

    cy.get('body', { timeout: 20000 })
      .selectFile(`${Cypress.config('fixturesFolder')}/${additionalNodeFile}`, {
        action: 'drag-drop',
        force: true,
      });

    cy.contains('#file-table .file-table-row', additionalNodeFile, { timeout: 20000 }).should('be.visible');
    cy.get('#launch', { timeout: 20000 }).should('not.be.disabled');

    cy.window().its('commonService.session.files').should((files: any[]) => {
      const fileNames = files.map((file) => file.name);

      expect(files, 'session files').to.have.length(3);
      expect(fileNames).to.include.members([nodeFile, linkFile, additionalNodeFile]);
    });
  });

  it('preserves analysis styling when files are removed and added back', () => {
    const customNodeColor = '#cc3366';

    cy.loadFiles([
      { name: nodeFile, datatype: 'node' },
      { name: linkFile, datatype: 'link' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const microbeTrace = win.commonService.visuals.microbeTrace;
      microbeTrace.SelectedNodeColorVariable = customNodeColor;
      microbeTrace.onNodeColorChanged(true);
    });
    cy.window()
      .its('commonService.session.style.widgets.node-color')
      .should('equal', customNodeColor);

    cy.contains('#file-table .file-table-row', linkFile)
      .find('.flaticon-delete-1')
      .click({ force: true });
    cy.contains('#file-table .file-table-row', linkFile).should('not.exist');
    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');
    cy.window()
      .its('commonService.session.style.widgets.node-color')
      .should('equal', customNodeColor);

    cy.loadFiles([{ name: linkFile, datatype: 'link' }]);
    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');
    cy.window()
      .its('commonService.session.style.widgets.node-color')
      .should('equal', customNodeColor);
  });

  it('preserves field-backed styling when files are updated without resetting settings', () => {
    const customNodeColor = '#cc3366';
    const shapeVariable = 'subtype';

    cy.loadFiles([
      { name: nodeFile, datatype: 'node' },
      { name: linkFile, datatype: 'link' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const microbeTrace = win.commonService.visuals.microbeTrace;
      microbeTrace.SelectedNodeColorVariable = customNodeColor;
      microbeTrace.onNodeColorChanged(true);
      microbeTrace.onNodeShapeByChanged(true, false, shapeVariable);
    });
    cy.window()
      .its('commonService.session.style.widgets.node-color')
      .should('equal', customNodeColor);
    cy.window()
      .its('commonService.session.style.widgets.node-symbol-variable')
      .should('equal', shapeVariable);

    cy.contains('#file-table .file-table-row', nodeFile)
      .find('.flaticon-delete-1')
      .click({ force: true });
    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');
    cy.window().then((win) => {
      expect(win.commonService.session.data.nodeFields).not.to.include(shapeVariable);
      expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal(shapeVariable);
      expect(win.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable).to.equal(shapeVariable);
      expect(win.commonService.session.style.widgets['node-color']).to.equal(customNodeColor);
    });

    cy.loadFiles([{ name: compatibleNodeFile, datatype: 'node', field1: '_id', field2: 'seq' }]);
    cy.get('#launch').should('contain.text', 'Update').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');
    cy.window().then((win) => {
      expect(win.commonService.session.data.nodeFields).to.include(shapeVariable);
      expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal(shapeVariable);
      expect(win.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable).to.equal(shapeVariable);
      expect(win.commonService.session.style.widgets['node-color']).to.equal(customNodeColor);
    });
  });

  it('resets all settings when files are updated with reset settings', () => {
    const customNodeColor = '#cc3366';
    const shapeVariable = 'subtype';

    cy.loadFiles([
      { name: nodeFile, datatype: 'node' },
      { name: linkFile, datatype: 'link' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const microbeTrace = win.commonService.visuals.microbeTrace;
      microbeTrace.SelectedNodeColorVariable = customNodeColor;
      microbeTrace.onNodeColorChanged(true);
      microbeTrace.onNodeShapeByChanged(true, false, shapeVariable);
      win.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
      win.commonService.session.style.widgets['link-threshold'] = 0.015;
      win.commonService.session.style.widgets['default-view'] = 'Map';
      win.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = 'tn93';
      win.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 0.015;
    });

    cy.contains('#file-table .file-table-row', nodeFile)
      .find('.flaticon-delete-1')
      .click({ force: true });
    cy.get('#launch-reset-settings', { timeout: 20000 })
      .should('exist')
      .click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const widgets = win.commonService.session.style.widgets;

      expect(win.commonService.session.data.nodeFields).not.to.include(shapeVariable);
      expect(widgets['node-color']).to.equal('#1f77b4');
      expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal('None');
      expect(widgets['default-distance-metric']).to.equal('snps');
      expect(widgets['link-threshold']).to.equal(16);
      expect(widgets['default-view']).to.equal('2D Network');
      expect(win.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable).to.equal('None');
      expect(win.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable).to.equal('snps');
      expect(win.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable).to.equal(16);
      expect(win.commonService.session.style.nodeColorsTable).to.deep.equal({});
      expect(win.commonService.session.style.nodeSymbolsTable).to.deep.equal({});
    });
  });
});
