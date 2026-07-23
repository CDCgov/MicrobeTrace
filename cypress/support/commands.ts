// cypress/support/commands.ts
/// <reference types="cypress" />

import { byTestId, testIds } from './selectors';

type FileLoadOptions = {
  name: string;
  datatype: 'link' | 'node' | 'matrix' | 'fasta' | 'newick' | 'MT/other';
  field1?: string;
  field2?: string;
  field3?: string;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const visibleSelectOverlay = '.p-select-overlay:visible';

function closeVisibleSelectOverlays(): void {
  cy.get('body').then(($body) => {
    if (!$body.find(visibleSelectOverlay).length) return;
    cy.get('body').type('{esc}', { force: true });
  });
}

declare global {
  namespace Cypress {
    interface Chainable {
      attach_file(
        targetSelector: string,
        fixturePath: string,
        mimeType?: string
      ): Chainable<Element>;

      attach_files(
        targetSelector: string,
        fixturePaths: string[],
        mimeType?: string[]
      ): Chainable<Element>;

      loadFiles(opts: FileLoadOptions[]): Chainable<void>;

      closeSettingsPane(dialogTitle: string): Chainable<void>;
      openGlobalSettings(): Chainable<void>;
      closeGlobalSettings(): Chainable<void>;
      enableTimelineMode(variableLabel?: string): Chainable<void>;
      waitForNetworkToRender(timeout?: number): Chainable<void>;
      get_common_service(): Chainable<any>;
      click_histogram_at(selector: string, ratio?: number): Chainable<void>;
    }
  }
}

export const getMimeTypeFromFilename = (name: string): string => {
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

const buildDataTransfer = (fixturePaths: string[], mimeTypes: string[]) => {
  const data = new DataTransfer();

  return cy.wrap(fixturePaths, { log: false }).each((fixturePath, index) => {
    const mimeType = mimeTypes[index] || 'application/octet-stream';

    cy.fixture(String(fixturePath), 'base64').then((base64) => {
      const binary = Cypress.Blob.base64StringToBlob(base64, mimeType);
      const file = new File([binary], String(fixturePath), { type: mimeType });
      data.items.add(file);
    });
  }).then(() => data);
};

Cypress.Commands.add('attach_file', (targetSelector, fixturePath, mimeType) => {
  const resolvedMimeType = mimeType || getMimeTypeFromFilename(fixturePath);
  return cy.attach_files(targetSelector, [fixturePath], [resolvedMimeType]);
});

Cypress.Commands.add('attach_files', (targetSelector, fixturePaths, mimeType) => {
  const mimeTypes =
    mimeType && mimeType.length ? mimeType : fixturePaths.map(getMimeTypeFromFilename);

  return buildDataTransfer(fixturePaths, mimeTypes).then((data) => {
    cy.get(targetSelector).then(($input) => {
      const el = $input.get(0) as HTMLInputElement;
      el.files = data.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
});

Cypress.Commands.add('loadFiles', (opts: FileLoadOptions[]) => {
  const getFileRow = (fileName: string): Cypress.Chainable<JQuery<HTMLElement>> =>
    cy.contains('#file-table .file-table-row', fileName, { timeout: 20000 }).should('exist');

  const fileNames = opts.map((file) => file.name);
  const mimeTypes = fileNames.map(getMimeTypeFromFilename);
  cy.get('body').then(($body) => {
    const overlayFileInputAvailable = $body.find('#overlay:visible #fileDropRef').length > 0;
    const targetSelector = overlayFileInputAvailable
      ? '#fileDropRef'
      : ($body.find('#data-files1').length ? '#data-files1' : '#fileDropRef');
    cy.attach_files(targetSelector, fileNames, mimeTypes);
  });

  cy.get('#launch', { timeout: 20000 }).should('not.be.disabled');

  opts.forEach((file) => {
    getFileRow(file.name).then(($fileRow) => {
      const activeType = $fileRow.find('label.active input').attr('data-type');

      if (activeType !== file.datatype) {
        getFileRow(file.name)
          .find(`input[data-type="${file.datatype}"]`)
          .click({ force: true });
      }

      if (file.datatype === 'link' || file.datatype === 'node') {
        const setField = (expectedValue: string, fieldNumber: number) => {
          const selectId = `file-${file.name}-field-${fieldNumber}`;

          cy.get(`select[id="${selectId}"]`, { timeout: 20000 })
            .should('exist')
            .then(($select) => {
              const currentValue = String($select.val());
              if (currentValue !== expectedValue) {
                cy.wrap($select).select(expectedValue, { force: true });
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
    .click({ force: true });

  cy.contains('.p-dialog-title', dialogTitle).should('not.exist');
});

Cypress.Commands.add('openGlobalSettings', () => {
  cy.get('body').then(($body) => {
    const isOpen = $body
      .find('.p-dialog:visible .p-dialog-title')
      .filter((_, element) => String(element.textContent || '').includes('Global Settings'))
      .length > 0;

    if (isOpen) return;
    cy.get(byTestId(testIds.appGlobalSettingsButton), { timeout: 15000 }).click({ force: true });
  });
  cy.wait(250);
  cy.get('body').then(($body) => {
    const isOpen = $body
      .find('.p-dialog:visible .p-dialog-title')
      .filter((_, element) => String(element.textContent || '').includes('Global Settings'))
      .length > 0;

    if (isOpen) return;
    cy.window().then((win: unknown) => {
      (win as any).commonService?.visuals?.microbeTrace?.DisplayGlobalSettingsDialog?.();
    });
  });
  cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings', { timeout: 15000 }).should('be.visible');
  cy.contains('.p-dialog:visible .nav-link', 'Timeline', { timeout: 15000 }).should('be.visible');
});

Cypress.Commands.add('closeGlobalSettings', () => {
  cy.contains('.p-dialog-title', 'Global Settings', { timeout: 15000 })
    .parents('.p-dialog')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.get('body').then(($body) => {
    const dialogSelector = byTestId(testIds.appGlobalSettingsDialog);
    if (!$body.find(dialogSelector).length) return;
    cy.get(dialogSelector).should('not.be.visible');
  });
});

Cypress.Commands.add('enableTimelineMode', (variableLabel = 'Date of symptom onset') => {
  cy.openGlobalSettings();

  cy.contains('.p-dialog:visible .nav-link', 'Timeline').click({ force: true });
  cy.get('.p-dialog:visible #timeline-config').should('exist').and('be.visible');

  closeVisibleSelectOverlays();
  cy.get('.p-dialog:visible #node-timeline-variable').click({ force: true });
  cy.get(visibleSelectOverlay, { timeout: 15000 })
    .last()
    .then(($overlay) => {
      if (variableLabel !== 'None') return;

      const scrollable = $overlay
        .find('.p-select-list-container, .p-virtualscroller, .p-select-items-wrapper')
        .filter((_, element) => element.scrollHeight > element.clientHeight)
        .first();

      if (scrollable.length) {
        scrollable.get(0).scrollTop = 0;
        scrollable.get(0).dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
  cy.get(visibleSelectOverlay, { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(variableLabel)}$`))
    .click({ force: true });
  closeVisibleSelectOverlays();
  cy.get('.p-dialog:visible #node-timeline-variable .p-select-label').should('contain', variableLabel);
});

Cypress.Commands.add('waitForNetworkToRender', (timeout = 20000) => {
  cy.get('#numberOfNodes', { timeout }).should('be.visible').and('not.contain', '0');
  cy.get('#numberOfVisibleLinks', { timeout }).should('be.visible');
});

Cypress.Commands.add('get_common_service', () => {
  return cy.window().its('commonService');
});

Cypress.Commands.add('click_histogram_at', (selector: string, ratio = 0.5) => {
  cy.get(selector).first().then(($el) => {
    const element = $el.get(0) as HTMLElement;
    const width = element.getBoundingClientRect().width;
    const height = element.getBoundingClientRect().height;
    cy.wrap($el).click(width * ratio, height / 2, { force: true });
  });
});

export {};
