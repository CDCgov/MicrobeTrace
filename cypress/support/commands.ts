// cypress/support/commands.ts
/// <reference types="cypress" />

declare global {
    namespace Cypress {
      interface Chainable {
        /**
         * Attaches a file from the fixtures folder to a file input element.
         * @param target_selector The selector for the <input type="file"> element.
         * @param fixture_path The path to the file within the fixtures folder.
         * @param mime_type The MIME type of the file.
         */
        attach_file(
          target_selector: string,
          fixture_path: string,
          mime_type?: string
        ): Chainable<Element>;

        /**
         * Attaches multiple files from the fixtures folder to a file input element.
         * @param target_selector The selector for the <input type="file"> element (ie. '#fileDropRef')
         * @param fixture_paths An array of the paths to the file within the fixtures folder
         * @param mime_type An array of the MIME type of the file.
         */
        attach_files(
          target_selector: string,
          fixture_paths: string[],
          mime_type?: string[]
        );

        /**
         * Wrapper around {@link attach_files} function that also sets/checks the datatype and fields
         * @param opts array of objects each containing file name and datatype and optional field values
         */
        loadFiles(opts :{
          name: string,
          datatype: 'link'|'node'|'matrix'|'fasta'|'newick'|'MT/other',
          field1 ?: string, 
          field2?: string, 
          field3?: string
        }[])

      /**
       * Closes a PrimeNG settings pane by its dialog title.
       * @param dialogTitle The title of the dialog to close.
       */
      closeSettingsPane(dialogTitle: string): Chainable<void>;

      // opens Global settings Menu
      openGlobalSettings(): Chainable<void>;
      closeGlobalSettings(): Chainable<void>;

      /**
       * Opens global settings and sets the Timeline By dropdown to the given label.
       * Defaults to 'Date of Symptions Resolved'.
       */
      enableTimelineMode(variableLabel?: string): Chainable<void>;
      }
    }
  }

  const getMimeTypeFromFilename = (name: string): string => {
    const ext = (name.split('.').pop() || '').toLowerCase();
  
    if (ext === 'csv') return 'text/csv';
    if (ext === 'json' || ext === 'microbetrace' || ext === 'style') return 'application/json';
  
    if (ext === 'fasta' || ext === 'fas' || ext === 'fa' || ext === 'nwk' || ext === 'newick') {
      return 'text/plain';
    }
  
    if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === 'xls') return 'application/vnd.ms-excel';
  
    return 'application/octet-stream';
  };
  
  Cypress.Commands.add('attach_files', (target_selector, fixture_paths, mime_type) => {
    const mimeTypes = (mime_type && mime_type.length)
      ? mime_type
      : fixture_paths.map(getMimeTypeFromFilename);
  
    const data = new DataTransfer();
  
    // Important: chain fixtures so the DataTransfer is fully populated before dispatching change
    cy.wrap(fixture_paths, { log: false }).each((fixture_path, idx) => {
      const mt = mimeTypes[idx] || 'application/octet-stream';
  
      cy.fixture(fixture_path, 'base64').then((base64) => {
        const binary = Cypress.Blob.base64StringToBlob(base64, mt);
        const file = new File([binary], fixture_path, { type: mt });
        data.items.add(file);
      });
    }).then(() => {
      cy.get(target_selector).then(($input) => {
        const el = $input.get(0) as HTMLInputElement;
        el.files = data.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
  
  // Similar to attach_files(), but allow multiple files to be attached/loaded at once
  Cypress.Commands.add('attach_files', (target_selector, fixture_paths, mime_type = ['text/csv']) => {
    const data = new DataTransfer();
    fixture_paths.forEach((fixture_path, i) => {
        cy.fixture(fixture_path, 'base64').then((base64) => {
        const binary = Cypress.Blob.base64StringToBlob(base64, mime_type[i]);
        const file = new File([binary], fixture_path, { type: mime_type[i] });
        data.items.add(file);
        })
    })
    cy.get(target_selector).then(($input) => {
      const el = $input.get(0) as HTMLInputElement;
      el.files = data.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // haven't tested newick, might need some more work when loading json, microbetrace, or auspice datatype
  Cypress.Commands.add('loadFiles', (opts: {
    name: string,
    datatype: 'link'|'node'|'matrix'|'fasta'|'newick'|'MT/other',
    field1?: string,
    field2?: string,
    field3?: string
  }[]) => {
    const fileNames = opts.map(f => f.name);
    const mimeTypes = fileNames.map(getMimeTypeFromFilename);
  
    // Upload (waits until all fixtures are actually attached)
    cy.attach_files('#fileDropRef', fileNames, mimeTypes);
  
    // Overlay goes away when file processing is done
    cy.get('#overlay', { timeout: 20000 }).should('not.be.visible');
  
    // Launch enabled is a stronger signal than "row is visible"
    cy.get('#launch', { timeout: 20000 }).should('not.be.disabled');
  
    // For each row: assert it exists (NOT visible), then set datatype/fields with force
    opts.forEach((file) => {
      cy.contains('#file-table .file-table-row', file.name, { timeout: 20000 })
        .should('exist')
        .then(($fileRow) => {
          const $row = cy.wrap($fileRow);
  
          // datatype toggle
          const activeType = $fileRow.find('label.active input').attr('data-type');
          if (activeType !== file.datatype) {
            $row.find(`input[data-type="${file.datatype}"]`).click({ force: true });
          }
  
          // field mapping
          if (file.datatype === 'link' || file.datatype === 'node') {
            const setField = (expectedValue: string, fieldNumber: number) => {
              const selectId = `file-${file.name}-field-${fieldNumber}`;
  
              cy.wrap($fileRow)
                .find(`select[id="${selectId}"]`)
                .should('exist')
                .then(($sel) => {
                  const current = String($sel.val());
                  if (current !== expectedValue) {
                    cy.wrap($sel).select(expectedValue, { force: true });
                  }
                });
  
              cy.get(`select[id="${selectId}"]`).should('have.value', expectedValue);
            };
  
            if (file.field1) setField(file.field1, 1);
            if (file.field2) setField(file.field2, 2);
            if (file.datatype === 'link' && file.field3) setField(file.field3, 3);
          }
        });
    });
  
    cy.get('#launch', { timeout: 20000 }).should('not.be.disabled');
  });

  Cypress.Commands.add('closeSettingsPane', (dialogTitle: string) => {
    cy.contains('.p-dialog-title', dialogTitle)
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .click();
    // Optionally, assert the dialog is closed
    cy.contains('.p-dialog-title', dialogTitle).should('not.exist');
  });

    Cypress.Commands.add('openGlobalSettings', () => {
    cy.contains('button', 'Settings').click();
    // Optionally, assert the dialog is closed
    cy.contains('.p-dialog-title', 'Global Settings').should('exist');
  });

  Cypress.Commands.add('closeGlobalSettings', () => {
    //cy.contains('button', 'Settings').click();
    // Optionally, assert the dialog is closed
    cy.contains('.p-dialog-title', 'Global Settings').parents('.p-dialog').find('button.p-dialog-close-button').click();

    cy.contains('.p-dialog-title', 'Global Settings').should('not.exist');
  });

  Cypress.Commands.add('enableTimelineMode', (variableLabel = 'Date of symptom onset') => {
    cy.openGlobalSettings();

    cy.contains('#global-settings-modal .nav-link', 'Timeline').click();
    cy.get('#timeline-config').should('be.visible');

    cy.get('#node-timeline-variable').click();
    cy.get('p-selectitem').contains('li', variableLabel).click();
    cy.get('#node-timeline-variable .p-select-label').should('contain', variableLabel);
  });
  
  Cypress.Commands.add('waitForNetworkToRender', (timeout = 20000) => {
    cy.log('Waiting for network to render...');
    // Wait for the stats panel to be visible, as it indicates data processing is complete
    cy.get('#numberOfNodes', { timeout }).should('be.visible').and('not.contain', '0');
    cy.get('#numberOfVisibleLinks', { timeout }).should('be.visible');
  });
  
  Cypress.Commands.add('get_common_service', () => {
      return cy.window().its('commonService');
  });

  export {};