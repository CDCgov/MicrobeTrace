/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  syncPreLaunchProfileToSession,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';
import type { DatasetProfile } from '../datasets/profile';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
    session: {
      data: {
        nodes: any[];
      };
    };
  };
};

function openAlignmentViewWithoutReadyAssertion(): void {
  cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
  cy.get(byTestId(testIds.appViewMenuAlignment), { timeout: 15000 }).click({ force: true });
}

function launchProfileToTwoDWithoutFileSettingsDialog(profile: DatasetProfile): void {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  syncPreLaunchProfileToSession(profile);
  launchAndWaitForProcessing(60000);
  ensureTwoDNetworkView();
}

function assertUnsupportedAlignmentState(): void {
  cy.get('.msa-viewer-container', { timeout: 30000 }).should('be.visible');
  cy.get('#msa-viewer', { timeout: 30000 }).should('be.visible');
  cy.get('.runtime-error-banner').should('not.exist');
  cy.get('#alignment-empty-state')
    .should('be.visible')
    .and('contain.text', 'No sequence-bearing nodes are available for Alignment View');

  cy.window({ timeout: 30000 }).then((win: unknown) => {
    const typedWindow = win as AlignmentWindow;
    const alignment = typedWindow.commonService.visuals.alignment;
    const sequenceLikeNodes = alignment.nodesWithSeq.map((index: number) => {
      const node = typedWindow.commonService.session.data.nodes[index];
      return {
        index,
        id: node?._id ?? node?.ID ?? node?.id ?? null,
        seq: node?.seq ?? null,
      };
    });

    expect(alignment, 'alignment visual').to.exist;
    expect(
      alignment.nodesWithSeq.length,
      `sequence-bearing nodes ${JSON.stringify(sequenceLikeNodes)}`,
    ).to.equal(0);
    expect(alignment.nodesWithoutSeq.length, 'nodes without sequence').to.equal(
      typedWindow.commonService.session.data.nodes.length,
    );
  });

  cy.get('.canvasLabels > div').should('have.length', 0);
  cy.get(byTestId(testIds.alignmentExcludedNodesButton)).then(($button) => {
    const count = Number(String($button.text()).trim());
    expect(count, 'excluded-node count').to.be.greaterThan(0);
  });
}

describe('Journey Flow - Alignment unsupported input handling', () => {
  const profiles = [
    getProfile('heatmap-snps-edgelist'),
    getProfile('heatmap-tn93-matrix'),
    getProfile('load-twod-newick-tn93-angular-testing'),
  ];

  profiles.forEach((profile) => {
    it(`keeps Alignment stable for uploaded non-sequence input: ${profile.id}`, () => {
      launchProfileToTwoDWithoutFileSettingsDialog(profile);

      openAlignmentViewWithoutReadyAssertion();
      assertUnsupportedAlignmentState();
    });
  });
});
