/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - SeqRuler TN93 parity', () => {
  it('honors Resolve ambiguity thresholds for FASTA-derived TN93 links', () => {
    visitAppAndAcceptEula();
    cy.loadFiles([
      {
        name: 'seqruler-tn93-resolve-threshold.fasta',
        datatype: 'fasta',
      },
    ]);

    cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'File Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('fileSettingsDialog');

    cy.get('@fileSettingsDialog').find('#default-distance-metric').select('tn93', { force: true });
    cy.get('@fileSettingsDialog').find('#ambiguity-resolution-strategy').select('RESOLVE', { force: true });
    cy.get('@fileSettingsDialog').find('#ambiguity-threshold')
      .clear()
      .type('0.05')
      .blur()
      .should('have.value', '0.05');
    cy.get('@fileSettingsDialog').find('#default-distance-threshold')
      .clear()
      .type('0.02')
      .blur()
      .should('have.value', '0.02');
    cy.get('@fileSettingsDialog').find('#default-view').select('2D Network', { force: true });
    cy.closeSettingsPane('File Settings');

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      expect(widgets['default-distance-metric']).to.equal('tn93');
      expect(widgets['ambiguity-resolution-strategy']).to.equal('RESOLVE');
      expect(Number(widgets['ambiguity-threshold'])).to.equal(0.05);
      expect(Number(widgets['link-threshold'])).to.equal(0.02);
    });

    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links;
      const linksAtCutoff = links.filter((link: any) => Number(link.distance) < 0.02);
      const degreeById = new Map<string, number>([
        ['MK025278_14554-09-AUG-02s', 0],
        ['MK025321_16491-06-AUG-03s', 0],
        ['MK025402_37875-16-JAN-07s', 0],
      ]);

      expect(links, 'all pairwise TN93 distances').to.have.length(3);
      expect(linksAtCutoff, 'TN93 0.02 links').to.have.length(2);
      linksAtCutoff.forEach((link: any) => {
        const source = typeof link.source === 'object' ? link.source._id : link.source;
        const target = typeof link.target === 'object' ? link.target._id : link.target;
        degreeById.set(source, (degreeById.get(source) || 0) + 1);
        degreeById.set(target, (degreeById.get(target) || 0) + 1);
        expect(Number(link.distance)).to.be.lessThan(0.02);
      });
      expect(Object.fromEntries(degreeById)).to.deep.equal({
        'MK025278_14554-09-AUG-02s': 1,
        'MK025321_16491-06-AUG-03s': 1,
        'MK025402_37875-16-JAN-07s': 2,
      });
    });
  });
});
