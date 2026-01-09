/// <reference types="cypress" />

import { Core } from 'cytoscape';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance?: Core;
  Cypress: any;
};

const FIXTURE_LINKLIST = 'AngularTesting_Distance_linklist_BS.csv';

const acceptEulaIfPresent = () => {
  cy.get('body', { log: false }).then($body => {
    const hasEula =
      $body.find('.p-dialog-title:contains("License Agreement")').length > 0;

    if (!hasEula) return;

    cy.contains('.p-dialog-title', 'License Agreement')
      .parents('.p-dialog')
      .within(() => {
        cy.contains('button', 'Accept').click({ force: true });
      });

    cy.contains('.p-dialog-title', 'License Agreement').should('not.exist');
  });
};

describe('Journey - upload -> launch -> 2D Network', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
    acceptEulaIfPresent();
  });

  it('uploads a link list fixture, launches, and renders the 2D Network Cytoscape view', () => {
    // Upload via overlay
    cy.attach_file('#fileDropRef', FIXTURE_LINKLIST);
    acceptEulaIfPresent();

    cy.get('#overlay').should('not.be.visible', { timeout: 15000 });

    // Ensure file registered + launch enabled
    cy.contains('#file-table .file-table-row', FIXTURE_LINKLIST, { timeout: 15000 })
      .should('be.visible');

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');

    // Launch processing
    cy.get('#launch').click({ force: true });

    // Wait for processing to finish (if modal is used)
    cy.get('#loading-information', { timeout: 60000 }).should('not.exist');

    // Confirm data exists in the session model (independent of which view auto-opens)
    cy.window({ timeout: 60000 }).its('commonService').then((cs: any) => {
      expect(cs.session.data.nodes.length, 'nodes loaded').to.be.greaterThan(0);
      expect(cs.session.data.links.length, 'links loaded').to.be.greaterThan(0);
    });

    // Ensure we are in 2D Network view (do not depend on cached default-view)
    // cy.contains('button', 'View').click({ force: true });
    // cy.contains('button[mat-menu-item]', '2D Network').click({ force: true });

    // Wait for Cytoscape + stats to render
    // cy.waitForNetworkToRender(60000);
    cy.window({ timeout: 15000 }).should('have.property', 'cytoscapeInstance');

    cy.get('#cy', { timeout: 15000 }).should('be.visible');
    cy.get('#cy').find('canvas').should('exist');

    // Assert Cytoscape has elements
    cy.window().then((win: unknown) => {
      const w = win as WinWithMT;
      const cyInstance = w.cytoscapeInstance as Core;

      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const nodeCount = cyInstance.nodes().length;
      const edgeCount = cyInstance.edges().length;

      expect(nodeCount, 'Cytoscape nodes').to.be.greaterThan(0);
      expect(edgeCount, 'Cytoscape edges').to.be.greaterThan(0);
    });

    // Sanity interaction: drag a safe node via the harness and verify model + geometry sync
    // cy.window().then((win: unknown) => {
    //   const w = win as WinWithMT;
    //   const cyInstance = w.cytoscapeInstance as Core;

    //   const candidate = cyInstance.nodes()
    //     .toArray()
    //     .find(n => n.children().length === 0 && !n.hasClass('parent') && !n.hasClass('hidden'));

    //   expect(candidate, 'draggable node candidate').to.exist;

    //   const node = candidate!;
    //   const nodeId = node.id();
    //   const initial = { ...node.position() };

    //   expect(w.Cypress?.test?.dragNodeDelta, 'TwoD drag harness').to.be.a('function');

    //   const after = w.Cypress.test.dragNodeDelta(nodeId, 25, 10);
    //   expect(after, 'drag helper returned a position').to.not.be.null;

    //   const cyNodeAfter = cyInstance.getElementById(nodeId);
    //   expect(cyNodeAfter.empty(), `node ${nodeId} still exists`).to.be.false;

    //   const posAfter = cyNodeAfter.position();
    //   expect(posAfter.x, 'geometry X').to.be.closeTo(initial.x + 25, 2);
    //   expect(posAfter.y, 'geometry Y').to.be.closeTo(initial.y + 10, 2);

    //   const backing = w.commonService.session.data.nodes.find((n: any) => (n._id || n.id) === nodeId);
    //   expect(backing, 'backing node in session.data.nodes').to.exist;

    //   expect(backing.x, 'model X').to.be.closeTo(posAfter.x, 2);
    //   expect(backing.y, 'model Y').to.be.closeTo(posAfter.y, 2);
    // });
  });
});
