/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  setTwoDLinkLabelVariable,
} from '../../../support/journey-helpers';

describe('Journey Flow - Newick parsed links support 2D link labels', () => {
  const profile = getProfile('load-twod-newick-tn93-angular-testing');

  it('renders parsed Newick link distances through the 2D link label control', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const decimalLength = Number(win.commonService.session.style.widgets['link-label-decimal-length']);
      const targetEdge = cyInstance
        .edges(':visible')
        .filter((edge: any) => {
          const distance = Number(edge.data('distance'));
          return Number.isFinite(distance) && distance > 0 && edge.data('hasDistance') !== false;
        })
        .first();

      expect(cyInstance, 'cytoscapeInstance').to.exist;
      expect(targetEdge.empty(), 'visible Newick-derived edge with numeric distance exists').to.equal(false);
      expect(decimalLength, 'default TN93 decimal precision').to.be.greaterThan(0);

      const distance = Number(targetEdge.data('distance'));

      cy.wrap(
        {
          edgeId: String(targetEdge.id()),
          distance,
          expectedLabel: distance.toFixed(decimalLength),
        },
        { log: false },
      ).as('newickDistanceEdge');
    });

    setTwoDLinkLabelVariable('distance');

    cy.get('@newickDistanceEdge').then((newickDistanceEdge) => {
      const edge = newickDistanceEdge as { edgeId: string; distance: number; expectedLabel: string };

      cy.window().then((win: any) => {
        const cyEdge = win.cytoscapeInstance.getElementById(edge.edgeId);

        expect(cyEdge.empty(), `rendered edge exists: ${edge.edgeId}`).to.equal(false);
        expect(Number(cyEdge.data('distance')), `parsed distance for ${edge.edgeId}`).to.be.closeTo(edge.distance, 1e-12);
        expect(String(cyEdge.data('label') || ''), `edge label data for ${edge.edgeId}`).to.equal(edge.expectedLabel);
        expect(String(cyEdge.style('label') || ''), `rendered edge label for ${edge.edgeId}`).to.equal(edge.expectedLabel);
      });
    });

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const labeledEdges = cyInstance
        .edges(':visible')
        .filter((edge: any) => {
          const distance = Number(edge.data('distance'));
          const label = String(edge.style('label') || '').trim();
          return Number.isFinite(distance) && distance > 0 && label !== '';
        });

      expect(labeledEdges.length, 'visible Newick-derived edges with rendered distance labels').to.be.greaterThan(0);

      labeledEdges.forEach((edge: any) => {
        const label = String(edge.style('label') || '').trim();
        expect(label, `numeric TN93 label for ${edge.id()}`).to.match(/^\d+\.\d+$/);
      });
    });
  });
});
