/// <reference types="cypress" />

import {
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - URL-loaded field names', () => {
  const datasetUrl = 'https://security-fixture.example/cerberus-dom-xss.json';
  const maliciousField = 'cerberus\"><img id="cerberusxss" src="x" onerror="window.xsstriggered=true">';

  it('treats Auspice field names from a URL as option text', () => {
    cy.fixture('nextstrain-yellow-fever-small.json').then((dataset) => {
      const maliciousDataset = Cypress._.cloneDeep(dataset);
      maliciousDataset.tree.children[0].node_attrs[maliciousField] = { value: 'test' };

      cy.intercept('GET', datasetUrl, maliciousDataset).as('loadMaliciousDataset');
    });

    visitAppAndAcceptEula({
      extraQuery: { url: datasetUrl },
    });

    cy.wait('@loadMaliciousDataset', { timeout: 30000 });
    waitForProcessingDialogToClear(120000);
    cy.window({ timeout: 300000 }).should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded).to.equal(true);
      expect(win.commonService.session.data.nodeFields).to.include(maliciousField);
      expect(win.xsstriggered).to.equal(undefined);
      expect(win.document.getElementById('cerberusxss')).to.equal(null);
    });

    cy.get<HTMLSelectElement>('#search-field').should(($select) => {
      const matchingOption = Array.from($select[0].options)
        .find(option => option.value === maliciousField);

      expect(matchingOption, 'malicious field option').to.exist;
      expect(matchingOption!.textContent).to.equal(maliciousField);
      expect($select.find('img, script')).to.have.length(0);
    });
  });
});
