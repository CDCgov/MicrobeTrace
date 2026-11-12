/// <reference types="cypress" />

import { getProfile } from '../journeys/datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
} from '../../support/journey-helpers';
import {
  assertTwoDRendererReady,
  getTwoDNodeSnapshots,
  rendererVisitOptions,
  TWO_D_RENDERER_CASES,
} from '../../support/twod-renderer-harness';

const profile = getProfile('style-apply-cypress-test-style-threshold');

TWO_D_RENDERER_CASES.forEach(({ label, mode }) => {
  describe(`threshold sensitivity - ${label}`, () => {
    beforeEach(() => {
      launchProfileToTwoD(profile, rendererVisitOptions(mode));
      assertAfterLaunchCounts(profile);
      assertTwoDRendererReady(mode);
    });

    it('scrubs locally without changing node positions, camera, or renderer identity', () => {
      let positionsBefore: Array<{ id: string; x: number; y: number }> = [];
      let viewBefore: any;
      let rendererIdentity: any;
      let targetIndex = 0;

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        positionsBefore = getTwoDNodeSnapshots(win).map(node => ({ id: node.id, x: node.x, y: node.y }));
        viewBefore = twoD.getRendererViewState();
        rendererIdentity = twoD.sigmaActive ? twoD.sigmaRenderer.getGraph() : twoD.cy;
        twoD.openThresholdSensitivity();
        const baselineIndex = twoD.thresholdSensitivityOptions.indexOf(twoD.thresholdSensitivityBaseline);
        targetIndex = baselineIndex >= twoD.thresholdSensitivityOptions.length / 2
          ? 0
          : twoD.thresholdSensitivityOptions.length - 1;
      });

      cy.get('[data-testid="threshold-sensitivity-panel"]').should('be.visible');
      cy.get('[data-testid="threshold-sensitivity-preview"]')
        .invoke('val', () => targetIndex)
        .trigger('input');

      cy.window().should((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        expect(twoD.thresholdSensitivityPreviewIndex, 'preview event index').to.equal(targetIndex);
        const changedEdges = twoD.thresholdSensitivityComparison.addedEdgeIds.length
          + twoD.thresholdSensitivityComparison.removedEdgeIds.length;
        expect(changedEdges, 'changed threshold links').to.be.greaterThan(0);
        const positionsAfter = getTwoDNodeSnapshots(win).map(node => ({ id: node.id, x: node.x, y: node.y }));
        expect(positionsAfter, 'fixed node positions').to.deep.equal(positionsBefore);
        expect(twoD.getRendererViewState(), 'fixed renderer-neutral camera').to.deep.equal(viewBefore);
        expect(twoD.sigmaActive ? twoD.sigmaRenderer.getGraph() : twoD.cy, 'same renderer graph').to.equal(rendererIdentity);
      });

      cy.get('[data-testid="threshold-sensitivity-transitions"]')
        .should('be.visible')
        .and('contain.text', 'baseline')
        .and('contain.text', 'preview')
        .and('not.contain.text', '→');
      cy.get('[data-testid="threshold-sensitivity-transitions"]').then($changes => {
        cy.get('[data-testid="threshold-sensitivity-range"]').then($range => {
          expect($changes.index(), 'changes appear before stability range').to.be.lessThan($range.index());
        });
      });
      cy.get('[data-testid="threshold-sensitivity-range"]')
        .should('contain.text', 'A higher line means more separate clusters');

      if (mode === 'sigma') {
        cy.get('[data-testid="network-threshold-sensitivity-overlay"]')
          .should('have.attr', 'data-active', 'true')
          .and('have.attr', 'data-changed-edge-count');
      } else {
        cy.window().should((win: any) => {
          const cyGraph = win.commonService.visuals.twoD.cy;
          expect(
            cyGraph.elements('.threshold-sensitivity-added, .threshold-sensitivity-removed').length,
            'temporary sensitivity classes',
          ).to.be.greaterThan(0);
        });
      }

      cy.get('[data-testid="threshold-sensitivity-cancel"]').click();
      cy.get('[data-testid="threshold-sensitivity-panel"]').should('not.exist');
      cy.window().should((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        expect(getTwoDNodeSnapshots(win).map(node => ({ id: node.id, x: node.x, y: node.y })))
          .to.deep.equal(positionsBefore);
        if (!twoD.sigmaActive) {
          expect(twoD.cy.edges('[thresholdSensitivityTemporary]').length).to.equal(0);
        }
      });
    });
  });
});
