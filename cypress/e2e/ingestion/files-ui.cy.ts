// cypress/e2e/ingestion/files-ui.cy.ts
/// <reference types="cypress" />

import { byTestId, testIds } from '../../support/selectors';
import {
  goToMapView,
  goToTableView,
  openMapSettingsDialog,
  saveSessionFromFileMenu,
  selectMapField,
  setMapNodeCollapsing,
} from '../../support/journey-helpers';
import {
  assertVisibleTableHeaders,
  setVisibleTableColumns,
} from '../../support/table-helpers';

describe('File Handling and Processing', () => {
  const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_BS.csv';
  const compatibleNodeFile = 'AngularTesting_nodes_Map.csv';
  const linkFile = 'AngularTesting_Epi_linklist_BS.csv';
  const additionalNodeFile = compatibleNodeFile;
  const geoJSONLocationFile = 'map-node-locations.geojson';
  const geoJSONCollisionNodeFile = 'FieldNameCollisionGeoJSONNodes.csv';
  const collisionFormats = ['csv', 'json', 'xlsx'] as const;
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
    cy.get('@unsafeFileRow').find('input[type="radio"]').should('have.length', 8);
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

  it('keeps quotes in uploaded file names from creating HTML attributes', () => {
    const quotedFileName = `nodes' data-single='true" data-double="true.csv`;

    cy.get('#fileDropRef').selectFile({
      contents: Cypress.Buffer.from('_id,seq\nsample-1,ACTG'),
      fileName: quotedFileName,
      mimeType: 'text/csv',
    }, { force: true });

    cy.contains('#file-table .file-table-row', quotedFileName, { timeout: 20000 })
      .should('be.visible')
      .then(($row) => {
        const mappingColumns = $row.find('select').closest('.col-4');
        const firstLabel = mappingColumns.eq(0).find('label').get(0) as HTMLLabelElement;
        const firstSelect = mappingColumns.eq(0).find('select').get(0) as HTMLSelectElement;

        expect(mappingColumns).to.have.length(3);
        expect(firstLabel.htmlFor).to.equal(`file-${quotedFileName}-field-1`);
        expect(firstSelect.id).to.equal(`file-${quotedFileName}-field-1`);
        expect($row.find('[data-single], [data-double]')).to.have.length(0);
      });
  });

  it('renders untrusted CSV headers as option text without executing them', () => {
    const fileName = 'csv-header-xss.csv';
    const unsafeHeader = 'x" class="fa-spin" onanimationstart="window.__mtHeaderInjected=true" y="';
    const csvContents = `source,target,${unsafeHeader}\nA,B,1\nB,C,2\n`;

    cy.window().then((win: Window & typeof globalThis & { __mtHeaderInjected?: boolean }) => {
      win.__mtHeaderInjected = false;
    });

    cy.get('#fileDropRef').selectFile({
      contents: Cypress.Buffer.from(csvContents),
      fileName,
      mimeType: 'text/csv',
    }, { force: true });

    cy.contains('#file-table .file-table-row', fileName, { timeout: 20000 })
      .should('be.visible')
      .find('select')
      .first()
      .find('option')
      .then(($options) => {
        const option = Array.from($options).find(item => item.value === unsafeHeader);

        expect(option, 'CSV header option').to.exist;
        expect(option?.getAttribute('class')).to.equal(null);
        expect(option?.getAttribute('onanimationstart')).to.equal(null);
        expect(option?.textContent?.toLowerCase()).to.contain('onanimationstart');
      });

    cy.get('#file-table .file-table-row [onanimationstart]').should('not.exist');
    cy.window().its('__mtHeaderInjected').should('equal', false);
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

  collisionFormats.forEach((extension) => {
    it(`protects canonical node and link fields when importing ${extension.toUpperCase()} tables`, () => {
      const collisionNodeFile = `FieldNameCollisionNodes.${extension}`;
      const collisionLinkFile = `FieldNameCollisionLinks.${extension}`;

      cy.loadFiles([
        { name: collisionNodeFile, datatype: 'node', field1: 'case_id', field2: 'seq' },
        { name: collisionLinkFile, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
      ]);

      cy.get('#launch').click({ force: true });
      cy.window({ timeout: 30000 })
        .its('commonService.session.network.isFullyLoaded')
        .should('be.true');

      cy.window().then((win) => {
        const { nodes, links, nodeFields, linkFields } = win.commonService.session.data;
        const node = nodes.find((candidate: any) => candidate._id === 'NODE-A');
        const link = links.find((candidate: any) =>
          [candidate.source, candidate.target].sort().join('|') === 'NODE-A|NODE-B'
        );

        expect(node, 'NODE-A').to.exist;
        expect(link, 'NODE-A to NODE-B link').to.exist;

        expect(node._id, 'canonical node id').to.equal('NODE-A');
        expect(node.id, 'canonical node id mirror').to.equal('NODE-A');
        expect(node.seq, 'selected sequence').to.equal('ACGT');
        expect(node.visible, 'canonical visibility').to.equal(true);
        expect(node.origin, 'canonical node provenance').to.include.members([collisionNodeFile, collisionLinkFile]);
        expect(String(node['_id (Imported)']), 'imported _id').to.equal('USER-_ID-A');
        expect(String(node['_id (Imported) 2']), 'distinct header with the same alias gets a suffix').to.equal('PREALIASED-A');
        expect(String(node['id (Imported)']), 'imported id').to.equal('USER-id-A');
        expect(String(node['ID (Imported)']), 'case-insensitive imported ID collision').to.equal('USER-ID-A');
        expect(String(node['origin (Imported)']), 'imported origin').to.equal('USER-ORIGIN-A');
        expect(String(node['visible (Imported)']).toLowerCase(), 'imported visibility').to.equal('false');
        expect(String(node['cluster (Imported)']), 'imported cluster').to.equal('101');
        expect(String(node['x (Imported)']), 'imported x coordinate').to.equal('10');
        expect(String(node['y (Imported)']), 'imported y coordinate').to.equal('20');
        expect(String(node['_jlat (Imported)']), 'imported map latitude').to.equal('50.5');
        expect(String(node._jlong), 'non-conflicting map longitude').to.equal('-100.5');
        expect(node.safe_status, 'non-conflicting node field').to.equal('Safe-A');

        expect([link.source, link.target].sort(), 'canonical endpoints').to.deep.equal(['NODE-A', 'NODE-B']);
        expect(link.distance, 'canonical distance').to.equal(0.125);
        expect(link.directed, 'canonical directionality').to.equal(false);
        expect(link.origin, 'canonical link provenance').to.include(collisionLinkFile);
        expect(link.origin, 'imported provenance cannot replace canonical provenance').not.to.include('USER-LINK-ORIGIN-A');
        expect(String(link['Distance (Imported)']), 'case-insensitive imported distance collision').to.equal('101.01');
        expect(String(link['id (Imported)']), 'imported link id').to.equal('USER-LINK-ID-A');
        expect(String(link['origin (Imported)']), 'imported link origin').to.equal('USER-LINK-ORIGIN-A');
        expect(String(link['visible (Imported)']).toLowerCase(), 'imported link visibility').to.equal('false');
        expect(String(link['cluster (Imported)']), 'imported link cluster').to.equal('201');
        expect(String(link['directed (Imported)']).toLowerCase(), 'imported directionality').to.equal('true');
        expect(link.Contact, 'non-conflicting link field').to.equal('Contact-A');

        expect(nodeFields, 'node collision aliases').to.include.members([
          '_id (Imported)',
          '_id (Imported) 2',
          'id (Imported)',
          'ID (Imported)',
          'origin (Imported)',
          'visible (Imported)',
          'cluster (Imported)',
          'x (Imported)',
          'y (Imported)',
          '_jlat (Imported)',
          '_jlong',
          'safe_status',
        ]);
        expect(nodeFields, 'selected node columns are not duplicated as metadata').not.to.include.members([
          'case_id',
          'seq (Imported)',
        ]);
        expect(linkFields, 'link collision aliases').to.include.members([
          'Distance (Imported)',
          'id (Imported)',
          'origin (Imported)',
          'visible (Imported)',
          'cluster (Imported)',
          'directed (Imported)',
          'Contact',
        ]);
        expect(linkFields, 'selected link columns are not duplicated as metadata').not.to.include.members([
          'source (Imported)',
          'target (Imported)',
          'distance (Imported)',
        ]);
      });
    });
  });

  it('reuses collision aliases across files and exposes exact unique labels in Map, Table, and 2D', () => {
    const collisionNodeFile = 'FieldNameCollisionNodes.csv';
    const collisionNodeFileSecond = 'FieldNameCollisionNodesSecond.csv';
    const collisionLinkFile = 'FieldNameCollisionLinks.csv';
    const collisionLinkFileSecond = 'FieldNameCollisionLinksSecond.csv';

    cy.loadFiles([
      { name: collisionNodeFile, datatype: 'node', field1: 'case_id', field2: 'seq' },
      { name: collisionNodeFileSecond, datatype: 'node', field1: 'case_id', field2: 'None' },
      { name: collisionLinkFile, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
      { name: collisionLinkFileSecond, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
    ]);

    cy.contains('#file-table .file-table-row', collisionNodeFile)
      .find('select')
      .first()
      .find('option')
      .then(($options) => {
        const labels = Array.from($options).map((option) => option.textContent);
        expect(labels, 'Files mapping labels').to.include.members(['id', 'ID', '_id', '_jlat', '_jlong']);
      });

    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const { nodes, links, nodeFields, linkFields } = win.commonService.session.data;
      const node = nodes.find((candidate: any) => candidate._id === 'NODE-C');
      const link = links.find((candidate: any) =>
        [candidate.source, candidate.target].sort().join('|') === 'NODE-A|NODE-C'
      );
      const labels = win.commonService.visuals.microbeTrace.FieldList
        .filter((option: any) => ['_jlat (Imported)', '_jlong'].includes(option.value))
        .map((option: any) => option.label);

      expect(String(node['_id (Imported)']), 'same alias reused for the second file').to.equal('USER-_ID-C');
      expect(String(node['origin (Imported)']), 'origin alias reused for the second file').to.equal('USER-ORIGIN-C');
      expect(String(node['_jlat (Imported)']), 'map alias reused for the second file').to.equal('52.5');
      expect(nodeFields.filter((field: string) => field === '_id (Imported)')).to.have.length(1);
      expect(String(link['id (Imported)']), 'link alias reused for the second file').to.equal('USER-LINK-ID-C');
      expect(String(link['origin (Imported)']), 'link origin alias reused for the second file').to.equal('USER-LINK-ORIGIN-C');
      expect(String(link['Distance (Imported)']), 'link distance alias reused for the second file').to.equal('103.03');
      expect(linkFields.filter((field: string) => field === 'id (Imported)')).to.have.length(1);
      expect(linkFields.filter((field: string) => field === 'origin (Imported)')).to.have.length(1);
      expect(linkFields.filter((field: string) => field === 'Distance (Imported)')).to.have.length(1);
      expect(labels, '2D exact labels').to.deep.equal(['_jlat (Imported)', '_jlong']);
    });

    goToMapView();
    cy.window().then((win) => {
      const options = win.commonService.visuals.gisMap.FieldList;
      const labelsByValue = new Map(options.map((option: any) => [option.value, option.label]));
      expect(labelsByValue.get('_jlat (Imported)'), 'Map latitude label').to.equal('_jlat (Imported)');
      expect(labelsByValue.get('_jlong'), 'Map longitude label').to.equal('_jlong');
    });

    openMapSettingsDialog();
    selectMapField('map-field-lat', '_jlat (Imported)', 'map-field-lat', '_jlat (Imported)');
    selectMapField('map-field-lon', '_jlong', 'map-field-lon', '_jlong');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    cy.window().its('commonService.visuals.gisMap.layers.featureGroup').should((featureGroup: any) => {
      const renderedById = new Map(featureGroup.getLayers().map((layer: any) => [layer.data._id, layer]));
      const firstNodeLayer: any = renderedById.get('NODE-A');
      const secondNodeLayer: any = renderedById.get('NODE-B');

      expect(firstNodeLayer, 'NODE-A map layer').to.exist;
      expect(secondNodeLayer, 'NODE-B map layer').to.exist;
      expect(firstNodeLayer._latlng.lat).to.equal(50.5);
      expect(firstNodeLayer._latlng.lng).to.equal(-100.5);
      expect(secondNodeLayer._latlng.lat).to.equal(51.5);
      expect(secondNodeLayer._latlng.lng).to.equal(-101.5);
    });

    goToTableView();
    setVisibleTableColumns(['_jlat (Imported)', '_jlong']);
    assertVisibleTableHeaders(['index', '_jlat (Imported)', '_jlong']);

    cy.window().then((win) => {
      const tableData = win.commonService.visuals.tableComp.SelectedTableData;
      const node = tableData.data.find((candidate: any) => candidate._id === 'NODE-A');
      expect(String(node['_jlat (Imported)']), 'Table imported latitude').to.equal('50.5');
      expect(String(node._jlong), 'Table original longitude').to.equal('-100.5');
    });
  });

  it('preserves imported aliases and exact field labels through a saved-session round trip', () => {
    const collisionNodeFile = 'FieldNameCollisionNodes.csv';
    const collisionLinkFile = 'FieldNameCollisionLinks.csv';
    const sessionFileBase = `cypress_imported_field_aliases_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    cy.loadFiles([
      { name: collisionNodeFile, datatype: 'node', field1: 'case_id', field2: 'seq' },
      { name: collisionLinkFile, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
    ]);

    cy.get('#launch').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    saveSessionFromFileMenu(sessionFileBase);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved node alias').to.include('"_id (Imported)"');
      expect(savedSession, 'saved link alias').to.include('"Distance (Imported)"');
    });

    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.data.nodeFields')
      .should('include', '_id (Imported)');
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');
    cy.window({ timeout: 90000 }).should((win: any) => {
      expect(win.commonService.pendingDashboardRestore, 'pending dashboard restore').to.equal(null);
      expect(
        win.commonService.visuals.microbeTrace.applyingPendingDashboardRestore,
        'dashboard restore in progress'
      ).to.equal(false);
    });

    cy.window().then((win) => {
      const { nodes, links, nodeFields, linkFields } = win.commonService.session.data;
      const node = nodes.find((candidate: any) => candidate._id === 'NODE-A');
      const link = links.find((candidate: any) =>
        [candidate.source, candidate.target].sort().join('|') === 'NODE-A|NODE-B'
      );
      const labelsByValue = new Map(
        win.commonService.visuals.microbeTrace.FieldList.map((option: any) => [option.value, option.label])
      );

      expect(nodeFields).to.include.members(['_id (Imported)', '_jlat (Imported)', '_jlong']);
      expect(linkFields).to.include.members(['Distance (Imported)', 'origin (Imported)']);
      expect(String(node['_id (Imported)']), 'restored node alias value').to.equal('USER-_ID-A');
      expect(String(node['_jlat (Imported)']), 'restored map alias value').to.equal('50.5');
      expect(String(link['Distance (Imported)']), 'restored link alias value').to.equal('101.01');
      expect(labelsByValue.get('_id (Imported)'), 'restored exact 2D label').to.equal('_id (Imported)');
      expect(labelsByValue.get('_jlat (Imported)'), 'restored exact map label').to.equal('_jlat (Imported)');
    });

    goToTableView();
    cy.get('.lm_tab.lm_active', { timeout: 30000 }).should('contain.text', 'Table');
    setVisibleTableColumns(['_id (Imported)', '_jlat (Imported)', '_jlong']);
    assertVisibleTableHeaders(['index', '_id (Imported)', '_jlat (Imported)', '_jlong']);
  });

  it('detects a GeoJSON location file, joins feature centers to nodes, and stores the layer', () => {
    cy.attach_files('#fileDropRef', [nodeFile, geoJSONLocationFile]);

    cy.contains('#file-table .file-table-row', geoJSONLocationFile, { timeout: 20000 })
      .should('be.visible')
      .within(() => {
        cy.contains('label', 'GeoJSON').should('be.visible');
        cy.get('input[data-type="geojson"]').should('be.checked');
        cy.contains('label', 'ID').should('be.visible');
        cy.get(`select[id="file-${geoJSONLocationFile}-field-1"]`).should('have.value', '_id');
        cy.get(`select[id="file-${geoJSONLocationFile}-field-2"]`).parent().should('not.be.visible');
        cy.get(`select[id="file-${geoJSONLocationFile}-field-3"]`).parent().should('not.be.visible');
      });

    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');

    cy.window().then((win) => {
      const session = win.commonService.session;
      const firstNode = session.data.nodes.find((node: any) => node._id === 'KF773425');
      const secondNode = session.data.nodes.find((node: any) => node._id === 'KF773426');
      const missingNode = session.data.nodes.find((node: any) => node._id === 'missing-node');

      expect(session.data.geoJSON?.type, 'stored GeoJSON layer').to.equal('FeatureCollection');
      expect(session.data.geoJSONLayerName, 'stored GeoJSON layer name').to.equal(geoJSONLocationFile);
      expect(session.style.widgets['map-user-geojson-show'], 'GeoJSON layer hidden until Map View shows it').to.equal(false);
      expect(session.style.widgets['map-field-lat'], 'GeoJSON latitude field selected').to.equal('GeoJSON Latitude');
      expect(session.style.widgets['map-field-lon'], 'GeoJSON longitude field selected').to.equal('GeoJSON Longitude');

      expect(firstNode['GeoJSON Latitude'], 'point latitude').to.equal(8);
      expect(firstNode['GeoJSON Longitude'], 'point longitude').to.equal(12);
      expect(firstNode['GeoJSON Feature ID'], 'point feature id').to.equal('KF773425');
      expect(firstNode.origin, 'point origin').to.include(geoJSONLocationFile);

      expect(secondNode['GeoJSON Latitude'], 'polygon center latitude').to.equal(8);
      expect(secondNode['GeoJSON Longitude'], 'polygon center longitude').to.equal(22);
      expect(secondNode['GeoJSON Feature ID'], 'polygon feature id').to.equal('KF773426');
      expect(missingNode, 'unmatched feature is not converted into a node').to.not.exist;
    });
  });

  it('preserves colliding tabular metadata when GeoJSON locations are joined', () => {
    cy.loadFiles([
      { name: geoJSONCollisionNodeFile, datatype: 'node', field1: 'case_id', field2: 'None' },
      { name: geoJSONLocationFile, datatype: 'geojson' },
    ]);

    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win) => {
      const { nodes, nodeFields } = win.commonService.session.data;
      const pointNode = nodes.find((node: any) => node._id === 'KF773425');
      const polygonNode = nodes.find((node: any) => node._id === 'KF773426');

      expect(pointNode['GeoJSON Latitude'], 'generated point latitude').to.equal(8);
      expect(pointNode['GeoJSON Longitude'], 'generated point longitude').to.equal(12);
      expect(pointNode['GeoJSON Feature ID'], 'generated point feature id').to.equal('KF773425');
      expect(String(pointNode['GeoJSON Latitude (Imported)']), 'imported latitude').to.equal('100.1');
      expect(String(pointNode['GeoJSON Longitude (Imported)']), 'imported longitude').to.equal('-200.1');
      expect(pointNode['GeoJSON Feature ID (Imported)'], 'imported feature id').to.equal('IMPORTED-FEATURE-A');

      expect(polygonNode['GeoJSON Latitude'], 'generated polygon latitude').to.equal(8);
      expect(polygonNode['GeoJSON Longitude'], 'generated polygon longitude').to.equal(22);
      expect(String(polygonNode['GeoJSON Latitude (Imported)']), 'second imported latitude').to.equal('101.2');
      expect(String(polygonNode['GeoJSON Longitude (Imported)']), 'second imported longitude').to.equal('-201.2');
      expect(polygonNode['GeoJSON Feature ID (Imported)'], 'second imported feature id').to.equal('IMPORTED-FEATURE-B');

      expect(nodeFields).to.include.members([
        'GeoJSON Latitude',
        'GeoJSON Longitude',
        'GeoJSON Feature ID',
        'GeoJSON Latitude (Imported)',
        'GeoJSON Longitude (Imported)',
        'GeoJSON Feature ID (Imported)',
        'safe_status'
      ]);
      expect(win.commonService.session.style.widgets['map-field-lat']).to.equal('GeoJSON Latitude');
      expect(win.commonService.session.style.widgets['map-field-lon']).to.equal('GeoJSON Longitude');
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
