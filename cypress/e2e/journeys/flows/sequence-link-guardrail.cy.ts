/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertMetricCount,
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const fastaProfile = getProfile('nn-angulartesting-snps16-fasta');

describe('Journey Flow - sequence-derived link guardrails', () => {
  it('warns and skips all-pairs FASTA link generation when the browser guardrail is exceeded', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(fastaProfile.files);
    applyPreLaunchFileSettings(fastaProfile);
    ensurePreLaunchProfileSynced(fastaProfile);

    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        sequencePairwiseLinkWarningThreshold: 10,
        sequencePairwiseLinkHardLimit: 10,
      };
    });

    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.get('#network-guardrail-warning', { timeout: 30000 })
      .should('be.visible')
      .and('contain.text', 'FASTA SNPS distance generation would create')
      .and('contain.text', 'above the 10 browser guardrail');

    assertMetricCount('#numberOfVisibleLinks', 0, 30000);

    cy.window().should((win: any) => {
      const warning = win.commonService.session.warnings.find((entry: any) => (
        entry?.type === 'sequence-pairwise-link-guardrail'
      ));

      expect(warning, 'sequence pairwise-link guardrail warning').to.exist;
      expect(warning.hardLimitHit, 'hard limit hit').to.equal(true);
      expect(warning.hardLimit, 'hard limit').to.equal(10);
      expect(warning.pairCount, 'guarded pair count').to.equal(91);
      expect(win.commonService.session.data.links.length, 'no sequence-derived links added').to.equal(0);
      expect(
        win.commonService.session.meta.performance.load.computeLinks.skippedByGuardrail,
        'computeLinks guardrail telemetry',
      ).to.equal(true);
    });
  });
});
