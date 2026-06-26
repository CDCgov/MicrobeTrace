/// <reference types="cypress" />

import {
  DATASET_PROFILES,
  resolveExpected,
  type DatasetProfile,
} from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  assertNetworkMatchesOracleSnapshot,
  assertVisibleNodeIds,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringEpsilonExponent,
  setFilteringPruneWith,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';
import type { OracleStep } from '../../../oracle/types';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

(contractMode ? describe : describe.skip)('Journey Contracts - Filtering and Newick', () => {
  const minimumClusterProfile = DATASET_PROFILES.find(
    (profile) => profile.id === 'filtering-min-cluster-reveal-epi-linklist',
  );
  const epsilonProfiles = DATASET_PROFILES.filter((profile: DatasetProfile) =>
    profile.tags.includes('nn-epsilon'),
  );
  const mixedOriginProfile = DATASET_PROFILES.find(
    (profile) => profile.id === 'filtering-mixed-origin-nearest-neighbor',
  );
  const newickProfile = DATASET_PROFILES.find(
    (profile) => profile.id === 'load-twod-newick-tn93-angular-testing',
  );

  const findLinkById = (links: any[], id: string) => {
    return links.find(
      (candidate) => candidate.id === id || [candidate.source, candidate.target].sort().join('-') === id,
    );
  };

  const assertMixedOriginPreservedLinks = (preservedLinkIds: string[], epiOrigin: string): void => {
    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];

      preservedLinkIds.forEach((id) => {
        const link = findLinkById(links, id);

        expect(link, `preserved mixed-origin link ${id}`).to.exist;
        expect(link.visible, `visibility for preserved mixed-origin link ${id}`).to.equal(true);
        expect(link.nn, `nn flag for preserved mixed-origin link ${id}`).to.equal(false);
        expect(link.origin, `origin array for preserved mixed-origin link ${id}`).to.include(epiOrigin);
      });
    });
  };

  (contractMode && minimumClusterProfile ? it : it.skip)(
    `${minimumClusterProfile?.title ?? 'Unknown profile'} keeps the intended minimum cluster and reveal behavior`,
    () => {
      const minimumClusterSize = minimumClusterProfile!.expectations.filtering?.minimumClusterSize;
      const afterCounts = resolveExpected(minimumClusterSize?.after, 'intended');
      const revealCounts = resolveExpected(minimumClusterSize?.reveal?.expectedCounts, 'intended');

      expect(minimumClusterSize, 'minimum cluster size contract').to.exist;
      expect(afterCounts, 'intended counts after minimum cluster size').to.exist;
      expect(revealCounts, 'intended counts after reveal').to.exist;

      launchProfileToTwoD(minimumClusterProfile!);
      assertAfterLaunchCounts(minimumClusterProfile!, 'intended');

      cy.window().then((win: any) => {
        const visibleNodeIds = win.cytoscapeInstance
          .nodes(':visible')
          .filter((node: any) => node.children().length === 0)
          .map((node: any) => String(node.id()))
          .sort();

        cy.wrap(visibleNodeIds, { log: false }).as('contractInitialVisibleNodeIds');
      });

      openGlobalFilteringTab();
      cy.get(byTestId(testIds.filterMinimumClusterSize))
        .clear()
        .type(String(minimumClusterSize!.to))
        .blur();
      cy.window()
        .its('commonService.session.style.widgets.cluster-minimum-size')
        .should('equal', minimumClusterSize!.to);
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      assertMetricCount('#numberOfNodes', afterCounts!.nodes!);
      assertMetricCount('#numberOfVisibleLinks', afterCounts!.visibleLinks!);
      assertMetricCount('#numberOfDisjointComponents', afterCounts!.clusters!);
      assertMetricCount('#numberOfSingletonNodes', afterCounts!.singletons!);

      if (minimumClusterSize!.hiddenNodeIds?.length) {
        cy.get('@contractInitialVisibleNodeIds').then((initialVisibleNodeIds) => {
          const expectedVisible = (initialVisibleNodeIds as string[]).filter(
            (nodeId) => !minimumClusterSize!.hiddenNodeIds!.includes(nodeId),
          );
          assertVisibleNodeIds(expectedVisible);
        });
      }

      openGlobalFilteringTab();
      cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      cy.window()
        .its('commonService.session.style.widgets.cluster-minimum-size')
        .should('equal', 1);

      assertMetricCount('#numberOfNodes', revealCounts!.nodes!);
      assertMetricCount('#numberOfVisibleLinks', revealCounts!.visibleLinks!);
      assertMetricCount('#numberOfDisjointComponents', revealCounts!.clusters!);
      assertMetricCount('#numberOfSingletonNodes', revealCounts!.singletons!);

      if (minimumClusterSize!.reveal?.restoredNodeIds?.length) {
        cy.get('@contractInitialVisibleNodeIds').then((initialVisibleNodeIds) => {
          assertVisibleNodeIds(initialVisibleNodeIds as string[]);
        });
      }
    },
  );

  epsilonProfiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} applies the intended epsilon progression`, () => {
      const nn = profile.expectations.nn;
      const epsilon = profile.expectations.filtering?.epsilonAfterNearestNeighbor;

      expect(nn, 'nearest neighbor contract').to.exist;
      expect(epsilon, 'epsilon contract').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-nn',
          kind: 'set-nearest-neighbor',
          enabled: true,
        },
        ...epsilon!.steps.map((step, index) => ({
          id: `epsilon-step-${index}`,
          kind: 'set-epsilon' as const,
          exponent: step.toExponent,
        })),
      ];
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      openGlobalFilteringTab();
      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();

      getOracleSnapshot('oracleResult', 'after-nn').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      epsilon!.steps.forEach((step, index) => {
        openGlobalFilteringTab();
        setFilteringEpsilonExponent(step.toExponent);
        cy.closeGlobalSettings();
        waitForProcessingDialogToClear();

        getOracleSnapshot('oracleResult', `epsilon-step-${index}`).then((snapshot) => {
          assertNetworkMatchesOracleSnapshot(snapshot);
        });
      });
    });
  });

  (contractMode && mixedOriginProfile ? it : it.skip)(
    `${mixedOriginProfile?.title ?? 'Unknown profile'} keeps the intended mixed-origin nearest-neighbor behavior`,
    () => {
      const mixedOrigin = mixedOriginProfile!.expectations.filtering?.mixedOriginNearestNeighbor;
      const epiOrigin = mixedOriginProfile!.files.find((file) => file.datatype === 'link')?.name ?? '';
      const confirmationText = 'It appears that you have links from two different sources';

      expect(mixedOrigin, 'mixed-origin nearest neighbor contract').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-nn',
          kind: 'set-nearest-neighbor',
          enabled: true,
        },
      ];
      computeOracleForProfile(mixedOriginProfile!, oracleSteps);

      launchProfileToTwoD(mixedOriginProfile!);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      openGlobalFilteringTab();
      cy.get('#filtering-epsilon-row').should('not.be.visible');
      cy.get('#prune-select').contains('span', 'Nearest Neighbor').click({ force: true });
      cy.contains('.p-dialog:visible', confirmationText, { timeout: 15000 }).as('nnConfirmDialog');
      cy.get('@nnConfirmDialog').contains('button', 'Confirm').click({ force: true });
      cy.contains('.p-dialog:visible', confirmationText).should('not.exist');
      cy.get('#filtering-epsilon-row').should('be.visible');
      cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
      cy.closeGlobalSettings();

      waitForProcessingDialogToClear();
      getOracleSnapshot('oracleResult', 'after-nn').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
      assertMixedOriginPreservedLinks(mixedOrigin!.preservedLinkIds ?? [], epiOrigin);
    },
  );

  (contractMode && newickProfile ? it : it.skip)(
    `${newickProfile?.title ?? 'Unknown profile'} keeps the intended Newick launch counts`,
    () => {
      launchProfileToTwoD(newickProfile!);
      assertAfterLaunchCounts(newickProfile!, 'intended');
    },
  );

  (contractMode && newickProfile ? it : it.skip)(
    `${newickProfile?.title ?? 'Unknown profile'} computes nearest-neighbor links from the Newick tree`,
    () => {
      launchProfileToTwoD(newickProfile!);
      assertAfterLaunchCounts(newickProfile!, 'intended');

      openGlobalFilteringTab();
      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      cy.window().then((win: any) => {
        const links = win.commonService.session.data.links as any[];
        const visibleNnLinks = links.filter((link) => link.visible && link.nn);
        const patristicNn = win.commonService.session.meta?.performance?.patristic?.nearestNeighbor;
        const maxInitialVisibleLinks = newickProfile!.expectations.afterLaunch?.visibleLinks ?? links.length;

        expect(patristicNn?.selectedLinks, 'patristic nearest-neighbor selected links').to.be.greaterThan(0);
        expect(visibleNnLinks.length, 'visible Newick nearest-neighbor links').to.be.greaterThan(0);
        expect(visibleNnLinks.length, 'visible Newick nearest-neighbor links stay pruned').to.be.at.most(maxInitialVisibleLinks);
      });
    },
  );
});
