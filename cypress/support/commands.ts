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
      }
    }
  }
  
  Cypress.Commands.add('attach_file', (target_selector, fixture_path, mime_type = 'text/csv') => {
      return cy.fixture(fixture_path, 'base64').then((base64) => {
        const binary = Cypress.Blob.base64StringToBlob(base64, mime_type);
        const file = new File([binary], fixture_path, { type: mime_type });
        const data = new DataTransfer();
        data.items.add(file);
        cy.get(target_selector).then(($input) => {
          const el = $input.get(0) as HTMLInputElement;
          el.files = data.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
  );
  
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